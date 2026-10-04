export type AdaptadorProveedor = 'openai' | 'anthropic' | 'gemini' | 'openai-compatible' | 'baidu'

export type ProveedorCatalogo = {
  codigo: string
  nombre: string
  adaptador: AdaptadorProveedor
  endpointModelos: string
}

// El catálogo es deliberadamente cerrado. Los modelos no se fijan aquí: cada
// clave descubre los que tiene disponibles y el superadmin decide los perfiles.
export const proveedoresIniciales: readonly ProveedorCatalogo[] = [
  { codigo: 'openai', nombre: 'OpenAI', adaptador: 'openai', endpointModelos: 'https://api.openai.com/v1/models' },
  { codigo: 'anthropic', nombre: 'Anthropic / Claude', adaptador: 'anthropic', endpointModelos: 'https://api.anthropic.com/v1/models' },
  { codigo: 'google', nombre: 'Google / Gemini', adaptador: 'gemini', endpointModelos: 'https://generativelanguage.googleapis.com/v1beta/models' },
  { codigo: 'xai', nombre: 'xAI / Grok', adaptador: 'openai-compatible', endpointModelos: 'https://api.x.ai/v1/models' },
  { codigo: 'deepseek', nombre: 'DeepSeek', adaptador: 'openai-compatible', endpointModelos: 'https://api.deepseek.com/models' },
  { codigo: 'alibaba-qwen', nombre: 'Alibaba / Qwen', adaptador: 'openai-compatible', endpointModelos: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models' },
  { codigo: 'zhipu-glm', nombre: 'Zhipu / GLM', adaptador: 'openai-compatible', endpointModelos: 'https://open.bigmodel.cn/api/paas/v4/models' },
  { codigo: 'moonshot-kimi', nombre: 'Moonshot / Kimi', adaptador: 'openai-compatible', endpointModelos: 'https://api.moonshot.ai/v1/models' },
  { codigo: 'baidu-ernie', nombre: 'Baidu / ERNIE', adaptador: 'baidu', endpointModelos: 'https://qianfan.baidubce.com/v2/models' },
]

export function proveedorDelCatalogo(codigo: string): ProveedorCatalogo {
  const proveedor = proveedoresIniciales.find((item) => item.codigo === codigo)
  if (!proveedor) throw new Error('PROVEEDOR_IA_NO_ADMITIDO')
  return proveedor
}

// El host sale de endpointModelos de cada proveedor (no de una constante por
// adaptador): openai-compatible agrupa proveedores con hosts distintos entre
// sí (x.ai, DeepSeek, Alibaba, Zhipu, Moonshot) — solo el patrón de ruta es
// fijo por adaptador.
export function endpointInvocacion(proveedor: ProveedorCatalogo, modeloId: string): string {
  const base = proveedor.endpointModelos.replace(/\/models$/, '')
  if (proveedor.adaptador === 'openai' || proveedor.adaptador === 'openai-compatible') return `${base}/chat/completions`
  if (proveedor.adaptador === 'anthropic') return `${base}/messages`
  if (proveedor.adaptador === 'gemini') return `${proveedor.endpointModelos}/${modeloId}:generateContent`
  throw new Error('PROVEEDOR_IA_SIN_ENDPOINT_INVOCACION')
}
