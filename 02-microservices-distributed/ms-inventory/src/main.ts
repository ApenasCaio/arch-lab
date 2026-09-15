import { randomUUID } from 'crypto';
import { publicar, consumir } from './messaging/brokerClient';
import { Estoque } from './domain/Estoque';
import {
  EstoqueReservadoEvent,
  EstoqueRevertidoEvent,
  PagamentoFalhouEvent,
  PedidoCriadoEvent,
  TIPOS_EVENTO,
  TOPICOS,
} from '../../shared-contracts/events';

/**
 * Ponto de entrada do ms-inventory.
 *
 * Este serviço não expõe nenhuma rota HTTP voltada ao cliente final — ele
 * é 100% orientado a eventos (Event-Driven). Reage a dois eventos:
 *   - PedidoCriadoEvent  -> reserva os itens no estoque.
 *   - PagamentoFalhouEvent -> executa a Ação Compensatória (reverte a reserva).
 */
const estoque = new Estoque();

async function reservarEstoque(evento: PedidoCriadoEvent): Promise<void> {
  console.log(`[ms-inventory] PedidoCriadoEvent recebido para pedido ${evento.pedidoId}`);

  for (const item of evento.payload.itens) {
    await estoque.garantirSaldoInicial(item.produtoId, 1000); // saldo de demonstração
  }

  await estoque.reservarItens(evento.pedidoId, evento.payload.itens);

  const respostaEvento: EstoqueReservadoEvent = {
    eventoId: randomUUID(),
    tipo: TIPOS_EVENTO.ESTOQUE_RESERVADO,
    pedidoId: evento.pedidoId,
    ocorridoEm: new Date().toISOString(),
    payload: { itensReservados: evento.payload.itens },
  };
  await publicar(TOPICOS.ESTOQUE, evento.pedidoId, respostaEvento);
  console.log(`[ms-inventory] EstoqueReservadoEvent publicado para pedido ${evento.pedidoId}`);
}

async function reverterEstoque(evento: PagamentoFalhouEvent): Promise<void> {
  console.warn(`[ms-inventory] PagamentoFalhouEvent recebido para pedido ${evento.pedidoId} -> disparando Ação Compensatória`);

  const itensRevertidos = await estoque.reverterReservaEstoque(evento.pedidoId);

  const respostaEvento: EstoqueRevertidoEvent = {
    eventoId: randomUUID(),
    tipo: TIPOS_EVENTO.ESTOQUE_REVERTIDO,
    pedidoId: evento.pedidoId,
    ocorridoEm: new Date().toISOString(),
    payload: { itensRevertidos, motivo: evento.payload.motivo },
  };
  await publicar(TOPICOS.ESTOQUE, evento.pedidoId, respostaEvento);
  console.log(`[ms-inventory] EstoqueRevertidoEvent publicado para pedido ${evento.pedidoId} (consistência eventual restaurada)`);
}

consumir(TOPICOS.PEDIDOS, async (valor) => {
  await reservarEstoque(JSON.parse(valor));
});

consumir(TOPICOS.PAGAMENTOS, async (valor) => {
  const evento = JSON.parse(valor);
  if (evento.tipo === TIPOS_EVENTO.PAGAMENTO_FALHOU) {
    await reverterEstoque(evento);
  }
});

console.log('[ms-inventory] serviço orientado a eventos escutando o broker (sem porta HTTP)');
