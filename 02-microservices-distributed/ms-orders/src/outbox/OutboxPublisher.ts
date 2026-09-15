import { PrismaClient } from '@prisma/client';
import { TOPICOS } from '../../../shared-contracts/events';
import { publicarBruto } from '../messaging/brokerClient';
import { OutboxRepository } from './OutboxRepository';

/**
 * Publicador assíncrono do Outbox ("Polling Publisher").
 *
 * Roda em segundo plano, em intervalos curtos, procurando eventos ainda não
 * publicados na tabela `outbox_events` e os envia ao broker de mensagens.
 * Só marca o registro como publicado APÓS confirmação do broker — se o
 * processo cair no meio do caminho, o evento simplesmente será reenviado na
 * próxima varredura (garantia "at-least-once", adequada porque os
 * consumidores são idempotentes por design de evento).
 */
export class OutboxPublisher {
  private readonly outbox = new OutboxRepository();
  private intervalo?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaClient) {}

  iniciar(intervaloMs = 2000): void {
    this.intervalo = setInterval(() => this.publicarPendentes(), intervaloMs);
    console.log('[ms-orders:OutboxPublisher] iniciado, varrendo a cada', intervaloMs, 'ms');
  }

  parar(): void {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  private async publicarPendentes(): Promise<void> {
    const pendentes = await this.outbox.buscarPendentes(this.prisma);

    for (const evento of pendentes) {
      await publicarBruto(TOPICOS.PEDIDOS, evento.pedidoId, evento.payloadJson);
      await this.outbox.marcarComoPublicado(this.prisma, evento.id);
      console.log(`[ms-orders:OutboxPublisher] evento '${evento.tipo}' publicado no broker (pedido ${evento.pedidoId})`);
    }
  }
}
