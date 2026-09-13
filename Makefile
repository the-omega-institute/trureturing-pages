.PHONY: append-verified research-catalog claim-audit

# Usage: make research-catalog SNAPSHOT=data/library/<digest>.json.gz
research-catalog:
	@test -n "$(SNAPSHOT)" || (echo "usage: make research-catalog SNAPSHOT=path/to/snapshot.json[.gz]" >&2; exit 2)
	$(or $(PYTHON),python) -m lib.research_catalog --snapshot "$(SNAPSHOT)" $(if $(CATALOG),--catalog "$(CATALOG)",)

# Usage: make append-verified SNAPSHOT=data/library/<digest>.json.gz
append-verified:
	@test -n "$(SNAPSHOT)" || (echo "usage: make append-verified SNAPSHOT=path/to/snapshot.json[.gz]" >&2; exit 2)
	/tmp/pagesvenv/bin/python -m lib.research_news append-verified --snapshot "$(SNAPSHOT)" $(if $(CATALOG),--catalog "$(CATALOG)",)

# Usage: make claim-audit AXIOMS=path/to/print-axioms.txt LITERATURE=path/to/lit-review.json
# AXIOMS comes from the independent Lean re-run (see docs/claim-audit.md); LITERATURE
# from a source-URL resolution pass. Produces site/assets/claim-audit.v1.json.
claim-audit:
	@test -n "$(AXIOMS)" || (echo "usage: make claim-audit AXIOMS=print-axioms.txt LITERATURE=lit-review.json" >&2; exit 2)
	@test -n "$(LITERATURE)" || (echo "usage: make claim-audit AXIOMS=print-axioms.txt LITERATURE=lit-review.json" >&2; exit 2)
	$(or $(PYTHON),python) -m lib.claim_audit --catalog $(or $(CATALOG),site/assets/research-catalog.json) --axioms "$(AXIOMS)" --literature "$(LITERATURE)" $(if $(REVIEWS),--reviews "$(REVIEWS)",) $(if $(OUT),--out "$(OUT)",)
