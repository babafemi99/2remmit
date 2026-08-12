class InvalidTransition(Exception):
    pass

class IdempotencyConflict(Exception):
    pass

class IdempotencyInProgress(Exception):
    pass


class WebhookEventConflict(Exception):
    pass
