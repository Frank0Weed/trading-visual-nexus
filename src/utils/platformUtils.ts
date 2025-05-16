
import { Capacitor } from '@capacitor/core';

/**
 * Check if the application is running on iOS
 */
export const isIOS = (): boolean => {
  return Capacitor.getPlatform() === 'ios';
};

/**
 * Check if the application is running on Android
 */
export const isAndroid = (): boolean => {
  return Capacitor.getPlatform() === 'android';
};

/**
 * Check if the application is running on web
 */
export const isWeb = (): boolean => {
  return Capacitor.getPlatform() === 'web';
};

/**
 * Check if the application is running on a native platform (iOS or Android)
 */
export const isNative = (): boolean => {
  return isIOS() || isAndroid();
};

/**
 * Get the current platform name
 */
export const getPlatformName = (): string => {
  return Capacitor.getPlatform();
};

/**
 * Check if the device is in dark mode
 * Note: This is a simple implementation and might need to be enhanced
 */
export const isDarkMode = (): boolean => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/**
 * Get device information
 */
export const getDeviceInfo = () => {
  return {
    platform: Capacitor.getPlatform(),
    isNative: isNative(),
    isWeb: isWeb(),
    isDarkMode: isDarkMode()
  };
};
