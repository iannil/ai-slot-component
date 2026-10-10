// 页面和管理预览都使用服务端同一份规范化注册表。
const response = await fetch('/registry.json');
if (!response.ok) throw new Error('registry_unavailable');
export const { registry, registryVersion, rendererVersion, allowedOrigins } = await response.json();
