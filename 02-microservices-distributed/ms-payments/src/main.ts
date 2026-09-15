import { randomUUID } from 'crypto';
import { publicar, consumir } from './messaging/brokerClient';
import { ProcessadorPagamento } from './domain/ProcessadorPagamento';
import {
  EstoqueReservadoEvent,
  PagamentoAprovadoEvent,
  PagamentoFalhouEvent,
  PedidoCriadoEvent,
  TIPOS_EVENTO,
  TOPICOS,
} from '../../shared-contracts/events';

/**
 * Ponto de entrada do ms-payments.
 *
 * Serviço orientado a eventos: mantém uma pequena "read model" local
 * (`pedidosConhecidos`) alimentada pelo PedidoCriadoEvent — cada
 * microsserviço materializa localmente apenas os dados de que precisa,
 * em vez de consultar o banco de outro serviço (o que violaria o
 * isolamento de "Database per Service").
 */
const processador = new ProcessadorPagamento();
const pedidosConhecidos = new Map<string, { clienteId: string; valorTotal: number }>();

function registrarPedido(evento: PedidoCriadoEvent): void {
  pedidosConhecidos.set(evento.pedidoId, {
    clienteId: evento.payload.clienteId,
    valorTotal: evento.payload.valorTotal,
  });
}

async function processarPagamento(evento: EstoqueReservadoEvent): Promise<void> {
  const dadosPedido = pedidosConhecidos.get(evento.pedidoId);
  if (!dadosPedido) {
    console.warn(`[ms-payments] EstoqueReservadoEvent para pedido desconhecido ${evento.pedidoId}, ignorando`);
    return;
  }

  console.log(`[ms-payments] processando pagamento do pedido ${evento.pedidoId} (cliente ${dadosPedido.clienteId})`);
  const resultado = processador.processar(dadosPedido.clienteId, dadosPedido.valorTotal);

  if (resultado.aprovado) {
    const aprovado: PagamentoAprovadoEvent = {
      eventoId: randomUUID(),
      tipo: TIPOS_EVENTO.PAGAMENTO_APROVADO,
      pedidoId: evento.pedidoId,
      ocorridoEm: new Date().toISOString(),
      payload: { valorPago: dadosPedido.valorTotal, transacaoId: resultado.transacaoId! },
    };
    await publicar(TOPICOS.PAGAMENTOS, evento.pedidoId, aprovado);
    console.log(`[ms-payments] pagamento APROVADO para pedido ${evento.pedidoId}`);
  } else {
    const falhou: PagamentoFalhouEvent = {
      eventoId: randomUUID(),
      tipo: TIPOS_EVENTO.PAGAMENTO_FALHOU,
      pedidoId: evento.pedidoId,
      ocorridoEm: new Date().toISOString(),
      payload: { motivo: resultado.motivoFalha! },
    };
    await publicar(TOPICOS.PAGAMENTOS, evento.pedidoId, falhou);
    console.warn(`[ms-payments] pagamento FALHOU para pedido ${evento.pedidoId}: ${resultado.motivoFalha} -> Saga entrará em compensação`);
  }
}

consumir(TOPICOS.PEDIDOS, (valor) => {
  registrarPedido(JSON.parse(valor));
});

consumir(TOPICOS.ESTOQUE, async (valor) => {
  const evento = JSON.parse(valor);
  if (evento.tipo === TIPOS_EVENTO.ESTOQUE_RESERVADO) {
    await processarPagamento(evento);
  }
});

console.log('[ms-payments] serviço orientado a eventos escutando o broker (sem porta HTTP)');
