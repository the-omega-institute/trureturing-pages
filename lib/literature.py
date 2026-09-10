"""Read Scribe's emitted citations as attribution, never as proof-use evidence."""
import re
from urllib.parse import urlsplit, urlunsplit, unquote

from markdown_it import MarkdownIt

MARKDOWN = MarkdownIt('commonmark')
CITATION = re.compile(r'^\*(Citation|Acknowledgement)\.\* (.+) \((\d{4})\)\. \*(.+)\*\. (?:DOI: \[([^\]]+)\]\(https://doi\.org/[^\s]+\)|URL: <([^>]+)>)\.$')
FORMALIZATION = re.compile(r'^\*Formalization\.\* `([^`]+)`')


def literature_identity(url):
    """Canonical stable identity; arXiv versions remain in each citation's source URL."""
    parsed = urlsplit(url)
    if parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Literature source must be a public HTTP(S) URL')
    if parsed.hostname.lower() in ('doi.org', 'dx.doi.org'):
        doi = unquote(parsed.path.lstrip('/')).lower()
        if not re.fullmatch(r'10\.\d{4,9}/[^\s<>"?#]+', doi):
            raise ValueError('Invalid DOI identifier')
        arxiv_doi = re.fullmatch(r'10\.48550/arxiv\.(\d{4}\.\d{4,5})(?:v\d+)?', doi)
        if arxiv_doi:
            arxiv = arxiv_doi[1]
            return 'arxiv:' + arxiv, {'arxiv': arxiv, 'doi': doi}, 'https://arxiv.org/abs/' + arxiv
        return 'doi:' + doi, {'doi': doi}, 'https://doi.org/' + doi
    if parsed.hostname.lower() in ('arxiv.org', 'www.arxiv.org'):
        match = re.fullmatch(r'/(?:abs|html|pdf)/(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?(?:\.pdf)?/?', parsed.path)
        if match:
            return 'arxiv:' + match[1], {'arxiv': match[1]}, 'https://arxiv.org/abs/' + match[1]
    stable = urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path, parsed.query, ''))
    return 'url:' + stable, {'url': stable}, stable


def parse_citations(text):
    citations, declaration = [], None
    for token in MARKDOWN.parse(text):
        if token.type == 'heading_open':
            declaration = None
        if token.type != 'inline':
            continue
        formal = FORMALIZATION.match(token.content)
        if formal:
            declaration = formal[1]
        match = CITATION.fullmatch(token.content)
        if not match:
            continue
        role, authors, year, title, doi, url = match.groups()
        url = 'https://doi.org/' + doi if doi else url
        identity, identifiers, canonical_url = literature_identity(url)
        item = dict(identity=identity, identifiers=identifiers, url=canonical_url,
                    source_url=url, title=title, authors=authors, year=int(year),
                    role=role.lower(), declaration_gid=declaration)
        if item not in citations:
            citations.append(item)
    return citations
