/**
 * Cliente do Broker (substituto didático do Kafka) do ms-orders.
 *
 * Cada microsserviço instancia seu PRÓPRIO cliente — não há um "SDK
 * compartilhado em código", apenas o broker compartilhado em infraestrutura
 * (processo HTTP separado, ver 02-microservices-distributed/broker).
 */
const URL_BASE = process.env.BROKER_URL ?? 'http://localhost:4500';

export async function publicar(topico: string, chave: string, valor: unknown): Promise<void> {
  await fetch(`${URL_BASE}/topicos/${encodeURIComponent(topico)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chave, valor: JSON.stringify(valor) }),
  });
}

/** Publica um payload já serializado como string (usado pelo OutboxPublisher). */
export async function publicarBruto(topico: string, chave: string, valorJson: string): Promise<void> {
  await fetch(`${URL_BASE}/topicos/${encodeURIComponent(topico)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chave, valor: valorJson }),
  });
}

/**
 * Consome um tópico via long-polling, em loop, a partir do offset 0
 * (equivalente a `fromBeginning: false` de um grupo novo no Kafka: como o
 * broker acaba de subir junto com os serviços, "desde o início" e "a
 * partir de agora" coincidem nesta demo).
 *
 * IMPORTANTE: `desde` só avança DEPOIS que `aoReceber` processa a mensagem
 * com sucesso (entrega "pelo menos uma vez", igual a um consumidor Kafka
 * que só faz commit do offset após processar). Se avançasse antes — como
 * já esteve neste arquivo —, qualquer erro transitório ao processar (ex:
 * SQLite ocupado sob concorrência) faria a mensagem ser silenciosamente
 * PERDIDA para sempre, mesmo o broker nunca a tendo perdido de verdade.
 */
export function consumir(topico: string, aoReceber: (valor: string) => Promise<void> | void): { parar(): void } {
  let ativo = true;
  let desde = 0;

  (async function loop() {
    while (ativo) {
      try {
        const resp = await fetch(`${URL_BASE}/topicos/${encodeURIComponent(topico)}?desde=${desde}&timeoutMs=20000`);
        const dados = (await resp.json()) as { mensagens: { offset: number; valor: string }[] };
        for (const mensagem of dados.mensagens) {
          await aoReceber(mensagem.valor);
          desde = mensagem.offset + 1;
        }
      } catch (erro) {
        console.error(`[brokerClient] erro consumindo '${topico}' (mensagem será reentregue):`, (erro as Error).message);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  })();

  return { parar: () => { ativo = false; } };
}
