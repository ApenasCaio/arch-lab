import express from 'express';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Pedido } from './domain/Pedido';
import { OutboxRepository } from './outbox/OutboxRepository';
import { OutboxPublisher } from './outbox/OutboxPublisher';
import { OrderSagaOrchestrator } from './saga/OrderSagaOrchestrator';
import { PedidoCriadoEvent, TIPOS_EVENTO } from '../../shared-contracts/events';

/**
 * Ponto de entrada do ms-orders.
 *
 * Diferente do monolito, este processo só conhece o "Pedido" e seu próprio
 * banco de dados isolado. Ele NÃO chama ms-inventory ou ms-payments
 * diretamente — toda comunicação ocorre via eventos assíncronos publicados
 * no broker de mensagens (Event-Driven Architecture).
 */
const app = express();
app.use(express.json());

const prisma = new PrismaClient();
const outbox = new OutboxRepository();

app.post('/pedidos', async (req, res) => {
  try {
    console.log('[ms-orders] POST /pedidos recebido ->', JSON.stringify(req.body));
    const pedido = Pedido.criar(req.body.clienteId, req.body.itens);

    await prisma.$transaction(async (tx) => {
      await tx.pedidoModel.create({
        data: {
          id: pedido.id,
          clienteId: pedido.clienteId,
          status: pedido.status,
          valorTotalCent: Math.round(pedido.valorTotal * 100),
          itensJson: JSON.stringify(pedido.itens),
        },
      });

      const evento: PedidoCriadoEvent = {
        eventoId: randomUUID(),
        tipo: TIPOS_EVENTO.PEDIDO_CRIADO,
        pedidoId: pedido.id,
        ocorridoEm: new Date().toISOString(),
        payload: {
          clienteId: pedido.clienteId,
          itens: pedido.itens,
          valorTotal: pedido.valorTotal,
        },
      };
      await outbox.registrarEvento(tx, TIPOS_EVENTO.PEDIDO_CRIADO, pedido.id, evento);
    });

    console.log(`[ms-orders] pedido ${pedido.id} persistido + evento gravado no Outbox (transação local ACID)`);
    return res.status(201).json({ id: pedido.id, status: pedido.status });
  } catch (erro) {
    console.error('[ms-orders] erro ao criar pedido:', erro);
    return res.status(400).json({ erro: (erro as Error).message });
  }
});

app.get('/pedidos/:id', async (req, res) => {
  const pedido = await prisma.pedidoModel.findUnique({ where: { id: req.params.id } });
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
  return res.json(pedido);
});

const outboxPublisher = new OutboxPublisher(prisma);
outboxPublisher.iniciar();

const saga = new OrderSagaOrchestrator(prisma);
saga.iniciar();

const PORTA = process.env.PORT ?? 3001;
app.listen(PORTA, () => console.log(`[ms-orders] escutando na porta ${PORTA}`));
