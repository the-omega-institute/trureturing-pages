class ConsensusInputError(ValueError):
    pass
class InvalidReviewError(ConsensusInputError):
    pass

ROLES = ("correctness", "value", "falsification")

def decide(machine_verdict, reviews, attempt=1, max_attempts=3):
    if type(attempt) is not int or type(max_attempts) is not int or attempt <= 0 or max_attempts <= 0:
        raise ConsensusInputError("attempts must be positive integers")
    if set(machine_verdict) - {"pass", "digest"} or not isinstance(machine_verdict.get("pass"), bool):
        raise ConsensusInputError("machine verdict must contain only pass and digest")
    if set(reviews) != set(ROLES):
        raise ConsensusInputError("all review seats are required")
    if attempt > max_attempts:
        return "dead-letter"
    for role in ROLES:
        review = reviews[role]
        if not isinstance(review, dict) or set(review) != {"digest", "verdict", "blocking_findings"}:
            raise InvalidReviewError("review fields incomplete or untrusted")
        if not isinstance(review["verdict"], str) or review["verdict"] not in {"approve", "revise", "reject"}:
            raise InvalidReviewError("invalid review verdict")
        if not isinstance(review["blocking_findings"], list):
            raise InvalidReviewError("blocking_findings required")
        if review["blocking_findings"]:
            if attempt >= max_attempts: return "dead-letter"
            return "revise"
    if machine_verdict["pass"]:
        return "accept"
    return "revise"
