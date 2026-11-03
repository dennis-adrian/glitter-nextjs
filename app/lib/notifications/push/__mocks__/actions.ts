import { fn } from "storybook/test";

// Storybook-only substitutes: the push control's stories never reach the
// database or a push service.
export const savePushDeviceAction = fn(async () => ({
  success: true,
  deviceId: 1,
}));
export const removePushDeviceAction = fn(async () => ({ success: true }));
export const releaseForeignPushDeviceAction = fn(async () => ({
  success: true,
}));
export const forgetPushDeviceAction = fn(async () => ({ success: true }));
