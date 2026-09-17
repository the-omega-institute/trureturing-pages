# Mathematical subjects in Evolution

The evolution overview groups modules into eight browsing subjects: number theory;
algebra; geometry and topology; analysis and dynamics; combinatorics and discrete
mathematics; probability, statistics and information; logic and computation; and
mathematical physics. This is an editorial navigation scheme, not an upstream
classification claim or a change to proof/dependency authority.

`site/assets/mathematical-subjects.mjs` owns the subject order, colors, explicit
source-folder defaults and content rules for mixed folders. Mixed folders use
archived module titles and paths, with content rules taking precedence over the
folder default. For example, Naming's completion-density theorem belongs to
geometry/topology, while Rewriting's Church–Rosser theorem belongs to logic.
These rules are a first editorial pass, not an exhaustive MSC classification;
ambiguous modules in known folders inherit that folder's broad subject default.
A single primary subject places each module once; actual import edges can cross
subjects and do not depend on the classification.

Explicit tool/packaging sources live in Formalization tools. Unrecognized source
folders and the three unresolved top-level stubs stay Unclassified. Both are
available through the Tools & unclassified toggle and excluded from the default
mathematical overview. New folders never silently fall back to mathematical
foundations. The homepage's existing taxonomy is unchanged.

Birth positions and subject assignments are retained from the first archived
appearance within each compatible analysis segment. Cohorts merge by subject and
birth observation for the overview; selecting a subject expands its source topics.
Original node IDs, presence gaps, dependency pairs and first-observed connection
times remain available. Edges internal to a displayed cohort are collapsed, while
cross-cohort bundles retain their original module pairs. The inspector lists the
selected cohort's modules. An analysis-profile change starts a fresh baseline.
