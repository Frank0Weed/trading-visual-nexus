
import { Capacitor } from '@capacitor/core';

/**
 * Get the current platform: web, ios, or android
 */
export const getPlatform = (): 'web' | 'ios' | 'android' => {
  if (Capacitor.isNativePlatform()) {
    return Capacitor.getPlatform() as 'ios' | 'android';
  }
  return 'web';
};

/**
 * Check if the app is running on a mobile device
 */
export const isNativeMobile = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Get the platform version number
 */
export const getPlatformVersion = (): string => {
  return Capacitor.getPlatformInfo().operatingSystemVersion;
};

/**
 * Check if the app is running in development mode
 */
export const isDevelopment = (): boolean => {
  return import.meta.env.DEV;
};
