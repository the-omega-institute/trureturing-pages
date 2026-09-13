.PHONY: append-verified research-catalog

# Usage: make research-catalog SNAPSHOT=data/library/<digest>.json.gz
research-catalog:
	@test -n "$(SNAPSHOT)" || (echo "usage: make research-catalog SNAPSHOT=path/to/snapshot.json[.gz]" >&2; exit 2)
	$(or $(PYTHON),python) -m lib.research_catalog --snapshot "$(SNAPSHOT)" $(if $(CATALOG),--catalog "$(CATALOG)",)

# Usage: make append-verified SNAPSHOT=data/library/<digest>.json.gz
append-verified:
	@test -n "$(SNAPSHOT)" || (echo "usage: make append-verified SNAPSHOT=path/to/snapshot.json[.gz]" >&2; exit 2)
	/tmp/pagesvenv/bin/python -m lib.research_news append-verified --snapshot "$(SNAPSHOT)" $(if $(CATALOG),--catalog "$(CATALOG)",)
