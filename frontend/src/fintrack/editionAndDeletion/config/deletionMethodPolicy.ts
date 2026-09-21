// When true, the deletion screen offers only CLOSE; RTA, SOFT and HARD keep their services and routes.
// The server refuses them too (*_DELETION_ENABLED in accountDeleteController.js), SOFT because a
// deactivated account cannot be restored and overview counts its balance; re-enabling needs both flags.
export const CLOSE_IS_THE_ONLY_METHOD = true;
