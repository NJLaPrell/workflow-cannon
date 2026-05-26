export type DrawerSubmitIntent = {
  type: "drawer.submit";
  values: Record<string, string>;
  sessionLabel: string;
};

export type DrawerCancelIntent = {
  type: "drawer.cancel";
};

export type DashboardIntent = DrawerSubmitIntent | DrawerCancelIntent;

export function isDrawerSubmitIntent(intent: DashboardIntent): intent is DrawerSubmitIntent {
  return intent.type === "drawer.submit";
}

export function isDrawerCancelIntent(intent: DashboardIntent): intent is DrawerCancelIntent {
  return intent.type === "drawer.cancel";
}

export type DrawerSubmitHandlerResult = {
  refreshed: boolean;
};
