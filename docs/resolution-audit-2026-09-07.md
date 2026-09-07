# Resolution audit: 7 September 2026

This audit distinguishes three separate questions: whether the repository has
verified a Lean statement; whether that statement answers the external problem;
and whether mdBook has registered the association. Missing registration is not
evidence of missing verification or of a mathematically open problem.

## Evidence and method

All three source modules were extracted with `git archive` from
`b9afa2151caf868e9018c02df14489bc7e409da8` and re-elaborated in a temporary directory
with Lean `v4.33.0`. Every installed package revision was compared with that
commit's `lake-manifest.json` before running. Existing compiled dependency
artifacts were reused; this was not a rebuild of Mathlib or a replay of the
whole repository admission harness.

All three Lean commands exited 0. The printed axiom closures of the resolving
theorems, and the other public theorems printed by these modules, were exactly
`propext`, `Classical.choice`, `Quot.sound`, with no `sorryAx` or custom axiom.
Their original PRs also show successful canonical Lean report production and
baseline admission. These checks establish formal validity; the source
comparisons below separately address what was formalized.

This is one Codex audit, not an independent multi-model consensus or a claim
of priority over all published and unpublished work. No upstream source,
Frozen record, or mdBook main branch was edited.

## Source correspondence

### Chamberland-Dilcher Conjecture 2.1

- [Original source, equation (2.3) and Conjecture 2.1](https://arxiv.org/html/2510.26291v1#S2.Thmtheorem1).
- [Lean source at the evidence pin](https://github.com/the-omega-institute/trureturing/blob/b9afa2151caf868e9018c02df14489bc7e409da8/D5/S1/Digit/AlternatingFloorSqrtZeroBlocks.lean).
- Resolving declaration: `conjecture21`; [merged PR #5914](https://github.com/the-omega-institute/trureturing/pull/5914).
- The source defines the floor difference on `1 <= l <= (n-1)/2` for odd
  positive `n`. For each eligible label with difference `delta >= 2`, it asks
  for `delta-1` consecutive zero entries, with disjoint blocks for different
  labels. The Lean theorem proves simultaneous existence and disjointness on
  that domain. `d_eq_floor_real_sqrt` proves the natural-square-root encoding
  agrees with the real-floor expression, including subtraction.
- The explicit start is `(n-1)/2 + 1 + lambda - Nat.sqrt(2*lambda*n)`.
- The paper already proves Theorem 1.1 by another method, but explicitly calls
  its proof of **Conjecture 2.1** incomplete. The result displayed by Pages is
  the latter, not a novelty claim for Theorem 1.1.
- Audit conclusion: the displayed conjecture is proved, not just a finite
  experiment or a conditional restatement.

### Pochhammer Conjecture 6.5

- [Original source, Example 6.4 and Conjecture 6.5](https://arxiv.org/html/2608.03723v1#S6.count5).
- [Lean source at the evidence pin](https://github.com/the-omega-institute/trureturing/blob/b9afa2151caf868e9018c02df14489bc7e409da8/D5/S3/Zeros/PochhammerDeformation/QuadraticInterval.lean).
- Resolving declaration: `quadratic_conjecture_refutation`;
  [merged PR #5859](https://github.com/the-omega-institute/trureturing/pull/5859).
- The source allows real `a > 0` and defines `M_n(a)` by **all complex roots**
  being real and lying in `[-1,0]`. Its conjecture includes the strict bound
  `0 < c_(2k)(a) < 2a`. Lean constructs the operator on the falling Pochhammer
  basis, proves its defining action and checks the same complex-root condition.
- In degree two, Lean proves `c2(a) = (sqrt(a*a+a)-a)/2` and the exact threshold
  `c2(a) < 2a` iff `a > 1/24`. At `a = 1/24`, `c2(a) = 1/12 = 2a`.
- A direct rational witness is `a = 1/24`, `t = 1/8 = 3a`:
  `L_a((X+t)^2) = (5X+3)^2/576`. Its only root is `-3/5`, so `t` belongs to
  `M_2(a)`, contrary to the conjectured upper endpoint `a+c2(a) < 3a`.
- Audit conclusion: this is a genuine counterexample to the universal
  conjecture's strict bound. It does not prove or classify all higher degrees,
  nor settle the remaining monotonicity or limiting-value questions.

### Bosma et al. Conjecture 17

- [Published JIS article 25.3.8](https://cs.uwaterloo.ca/journals/JIS/vol28.html#P25.3.8)
  and its [publisher-hosted TeX](https://cs.uwaterloo.ca/journals/JIS/VOL28/Fokkink/fokkink9.tex),
  statement labelled `conj_d_g`.
- [Lean source at the evidence pin](https://github.com/the-omega-institute/trureturing/blob/b9afa2151caf868e9018c02df14489bc7e409da8/D5/S1/Words/Sumfree/GreedyThreeSumfreeTwoParameter.lean).
- Resolving declaration: `conjecture17`; [merged PR #5862](https://github.com/the-omega-institute/trureturing/pull/5862).
- Lean defines the literal least-next-entry greedy sequence from `1,g,g+d`,
  excluding sums of three distinct earlier entries, and proves its full
  membership characterization for every natural `d >= 2`, `g >= d+1`.
  The four exceptional terms, modulus `5g+2d`, and inclusive residue bounds
  agree with the published statement.
- The original arXiv v1 numbers this statement Conjecture 6 and prints
  `z > g+d`; the journal corrects this to `z >= g+d`. Lean uses the journal
  formulation. The earlier arXiv expression would omit the third seed.
- Audit conclusion: the published conjecture is proved. This is distinct from
  Conjecture 16, which uses the third seed `g+1`.

## Registration status and issue scope

The live mdBook inspected during this audit pins
`069ec31868931e4fdffb9d60bb69d026981b0a9c` and already displays **10 dossiers and
2 recorded resolutions**, for Bosma and Thue-Morse. The earlier observation of
7 dossiers and 0 records is historical, not the current state. The follow-up
below also checks Thue-Morse, completing the recorded mdBook resolution list.

Freshly fetched upstream `origin/dev` at
`4a03a56b99778eb9d4ce1e31ae52b44fdab1aff1` still has no problem dossiers or emitted
resolution bindings for the Chamberland-Dilcher and Pochhammer results above.
Bosma's binding is present. Therefore the remaining registration request is
limited to those two verified, source-matched results:

- [trureturing #6179](https://github.com/the-omega-institute/trureturing/issues/6179):
  register the two exact questions and their typed proved/refuted associations.
- [mdBook #4](https://github.com/the-omega-institute/trureturing-mdbook/issues/4):
  withdrawn after the owner's architecture clarification. Pages and mdBook
  consume upstream independently; no mdBook registration or publication is
  required for Pages to display these reviewed results manually.

An upstream verified lemma, a conditional route, or an unbound dossier alone
is insufficient grounds for an issue claiming that an external open problem
has been resolved. The exact external statement and the formal conclusion must
be compared first. Mathematical resolution and historical novelty remain
separate claims.

## Follow-up: audit the results actually listed by mdBook

The owner clarified that the task is to audit mdBook's recorded resolutions
and import the valid results into Pages. On re-fetching the public page, the
same two records remain: Bosma (already displayed and audited above), and
Thue-Morse (newly added to Pages after the checks below). No other mdBook entry
is marked proved/refuted in this snapshot. Existing Pages results remain.

### Thue-Morse reduced abelian odd recurrence

- [Original paper, definitions (4)-(5)](https://arxiv.org/html/2509.16034v1#S1)
  and [section 3's proposed recurrence](https://arxiv.org/html/2509.16034v1#S3).
- [Pinned Lean source](https://github.com/the-omega-institute/trureturing/blob/b9afa2151caf868e9018c02df14489bc7e409da8/D5/S1/Words/Complexity/ThueMorseReducedAbelianOdd.lean)
  and [merged proof PR #5816](https://github.com/the-omega-institute/trureturing/pull/5816).
- The paper defines reduction by collapsing maximal constant runs. Two reduced
  words are equivalent when they have the same length and character
  multiplicities. Lean uses `List.destutter` and Parikh vectors; equality of
  these vectors implies both required properties. The public bridge
  `reducedParikh_eq_parikh_runCompress` connects its arithmetic encoding to the
  literal compressed factor. Its factors quantify over **all natural starts**,
  not a sampled prefix. Zero-based binary parity is the source word with its
  one-based indices shifted by one.
- `reducedAbelianComplexity_odd (n : Nat)` proves `R(2*n+1) = R(n+1)` without
  additional hypotheses. A bijection on reduced class codes reflects run
  counts and uses complementary factors to cover odd starting positions.
- Fresh re-elaboration of this exact pinned file with Lean v4.33.0 exited 0;
  all package revisions matched the pin's manifest. Printed axiom closures
  are exactly `propext`, `Classical.choice`, `Quot.sound`. The original PR also
  has successful canonical Lean report and admission checks. Dependency build
  artifacts were reused, as in the earlier audit.
- **Conclusion:** the odd recurrence proposed by the paper is proved. This
  does not settle its full recursion, even-index recursion, equation (11),
  the nonzero sign of the even-index difference, or non-k-automaticity. The
  power-of-two corollary is not counted as another resolved open problem.

Pages adds this as a reviewed manual result immediately. Long-term automation
should use the upstream typed resolution report directly, independently of
mdBook. The upstream interface PR adds the missing exact declaration identity
to that existing JSON report rather than creating a second problem registry.
