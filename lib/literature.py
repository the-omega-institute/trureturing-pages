"""Read Scribe's emitted citations as attribution, never as proof-use evidence."""
import re
from urllib.parse import quote, urlsplit, urlunsplit, unquote

from markdown_it import MarkdownIt

MARKDOWN = MarkdownIt('commonmark')
CITATION = re.compile(r'^\*(Citation|Acknowledgement)\.\* (.+) \((\d{4})\)\. \*(.+)\*\. (?:DOI: \[([^\]]+)\]\(https://doi\.org/[^\s]+\)|URL: <([^>]+)>)\.$')
FORMALIZATION = re.compile(r'^\*Formalization\.\* `([^`]+)`')


def validate_http_url(url):
    """Validate the original URL before urlsplit can discard whitespace or controls."""
    if not isinstance(url, str) or re.search(r'[\s\x00-\x1f\x7f<>"\\]|%(?![0-9a-fA-F]{2})', url):
        raise ValueError('Literature source must be a public HTTP(S) URL')
    parsed = urlsplit(url)
    if parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.username is not None or parsed.password is not None:
        raise ValueError('Literature source must be a public HTTP(S) URL')
    # Accessing port also rejects nonnumeric and out-of-range ports.
    parsed.port
    if ':' not in parsed.hostname:  # urlsplit already validates bracketed IPv6 hosts.
        host = parsed.hostname.encode('idna').decode('ascii').rstrip('.')
        if len(host) > 253 or any(not re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?', label)
                                  for label in host.split('.')):
            raise ValueError('Invalid HTTP(S) source hostname')
    return parsed


def problem_source_url(problem):
    """Link to the single DOI, arXiv or URL source retained in a problem snapshot."""
    if problem.get('doi'):
        return 'https://doi.org/' + quote(problem['doi'], safe='/')
    if problem.get('arxiv_id'):
        return 'https://arxiv.org/abs/' + problem['arxiv_id']
    return problem['url']


def literature_identity(url, *, url_source=False):
    """Canonical stable identity; arXiv versions remain in each citation's source URL."""
    parsed = validate_http_url(url)
    if parsed.hostname.lower() in ('doi.org', 'dx.doi.org'):
        doi = unquote(parsed.path.lstrip('/')).lower()
        if not re.fullmatch(r'10\.\d{4,9}/[^\s<>"?#]+', doi):
            # An explicitly URL-sourced dossier can cite a general page on this
            # host. DOI citations still require a valid identifier.
            if not url_source:
                raise ValueError('Invalid DOI identifier')
        else:
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
