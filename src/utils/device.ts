const DEVICE_ID_KEY = 'device_id';
export function getDeviceId(): string {
 let id = uni.getStorageSync(DEVICE_ID_KEY);
 if (!id) { id = crypto.randomUUID(); uni.setStorageSync(DEVICE_ID_KEY, id); }
 return id;
}
