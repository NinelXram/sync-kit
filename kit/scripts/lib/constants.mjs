export const TYPES = ['feature', 'breaking', 'bugfix', 'deprecation', 'bug-report', 'question'];
export const PRIORITIES = ['blocker', 'high', 'normal', 'low'];
export const STATUSES = ['pending', 'acked', 'applied', 'disputed', 'n/a'];
export const OPEN_STATUSES = ['pending', 'acked', 'disputed'];
export const DONE_STATUSES = ['applied', 'n/a'];
export const FIELDS = ['id', 'title', 'module', 'from', 'author', 'type', 'priority', 'created', 'refs', 'targets'];
export const REQUIRED_FIELDS = ['id', 'title', 'module', 'from', 'type', 'priority', 'created', 'targets'];
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
