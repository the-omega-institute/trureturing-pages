.PHONY: append-verified

# Usage: make append-verified SNAPSHOT=data/library/<digest>.json.gz
append-verified:
	@test -n "$(SNAPSHOT)" || (echo "usage: make append-verified SNAPSHOT=path/to/snapshot.json[.gz]" >&2; exit 2)
	/tmp/pagesvenv/bin/python -m lib.research_news append-verified --snapshot "$(SNAPSHOT)" $(if $(CATALOG),--catalog "$(CATALOG)",)
