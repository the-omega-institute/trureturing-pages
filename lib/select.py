from functools import lru_cache

def _nodes(snapshot):
    return {n["gid"]: n for n in snapshot.get("open_set", [])}

def eligibility(snapshot):
    return [n["gid"] for n in snapshot.get("open_set", []) if n.get("deps_all_closed") is True]

def _depths(nodes):
    visiting, done = set(), {}
    def depth(gid):
        if gid in done:
            return done[gid]
        if gid in visiting:
            raise ValueError("dependency cycle")
        visiting.add(gid)
        deps = nodes[gid].get("deps", [])
        known = [depth(d) + 1 for d in deps if d in nodes]
        result = max(known, default=0)
        visiting.remove(gid); done[gid] = result
        return result
    for gid in nodes:
        depth(gid)
    return done

def select_one(eligible, snapshot):
    if not eligible:
        return None
    nodes = _nodes(snapshot)
    try:
        depths = _depths(nodes)
    except ValueError:
        return None
    open_ids = set(nodes)
    unlocks = {gid: 0 for gid in open_ids}
    for node in nodes.values():
        for dep in node.get("deps", []):
            if dep in open_ids:
                unlocks[dep] += 1
    ranked = sorted((gid for gid in eligible if gid in nodes), key=lambda gid: (-unlocks[gid], depths[gid], gid))
    if not ranked:
        return None
    return ranked[0], (ranked[1] if len(ranked) > 1 else None)
