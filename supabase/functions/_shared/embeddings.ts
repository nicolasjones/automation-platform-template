// Compartido entre indexar-documento y preguntar-documentos — OpenAI es el
// único proveedor de embeddings soportado (research.md R8). batch: true
// envía todos los textos en una sola llamada (la API de OpenAI acepta
// input como array), más rápido y más barato que una llamada por fragmento.
export async function generarEmbeddings(textos: string[], clave: string): Promise<number[][]> {
  const respuesta = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: textos }),
  })
  if (!respuesta.ok) throw new Error(`EMBEDDING_PROVEEDOR_IA_FALLO_${respuesta.status}`)
  const cuerpo = await respuesta.json()
  return cuerpo.data.map((item: { embedding: number[] }) => item.embedding)
}

export async function generarEmbedding(texto: string, clave: string): Promise<number[]> {
  const [embedding] = await generarEmbeddings([texto], clave)
  return embedding
}
