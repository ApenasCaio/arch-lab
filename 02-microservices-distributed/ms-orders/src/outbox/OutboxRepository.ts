import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Padrão Transactional Outbox.
 *
 * Problema que resolve: se o serviço gravasse o Pedido no banco E DEPOIS
 * publicasse o evento no Kafka como duas operações separadas, uma queda do
 * processo entre as duas operações causaria perda do evento (o pedido
 * existiria, mas ninguém mais no ecossistema saberia disso).
 *
 * Solução: a criação do Pedido e o REGISTRO do evento na tabela
 * `outbox_events` ocorrem na MESMA transação ACID local (mesmo `BEGIN` do
 * Postgres). Um publicador assíncrono (ver OutboxPublisher.ts) varre essa
 * tabela e envia ao Kafka, marcando como publicado somente após sucesso.
 */
export class OutboxRepository {
  async registrarEvento(
    tx: Prisma.TransactionClient,
    tipo: string,
    pedidoId: string,
    payload: unknown,
  ): Promise<void> {
    await tx.outboxEventModel.create({
      data: {
        tipo,
        pedidoId,
        payloadJson: JSON.stringify(payload),
      },
    });
  }

  async buscarPendentes(prisma: PrismaClient, limite = 20) {
    return prisma.outboxEventModel.findMany({
      where: { publicado: false },
      orderBy: { criadoEm: 'asc' },
      take: limite,
    });
  }

  async marcarComoPublicado(prisma: PrismaClient, id: string): Promise<void> {
    await prisma.outboxEventModel.update({ where: { id }, data: { publicado: true } });
  }
}
