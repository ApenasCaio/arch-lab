import { PrismaClient } from '@prisma/client';
import { consumir } from '../messaging/brokerClient';
import {
  EstoqueReservadoEvent,
  EventoDoBarramento,
  PagamentoAprovadoEvent,
  PagamentoFalhouEvent,
  TIPOS_EVENTO,
  TOPICOS,
} from '../../../shared-contracts/events';

/**
 * Orquestrador da Saga (Padrão Saga Orquestrada).
 *
 * O evento inicial (`PedidoCriadoEvent`) já foi disparado pelo Transactional
 * Outbox no momento da criação do pedido. A partir daqui, este orquestrador
 * ESCUTA as respostas dos demais participantes da transação distribuída
 * (ms-inventory e ms-payments) e decide o próximo passo, atualizando o
 * estado local do Pedido (`ms-orders` é o "dono" do status do pedido).
 *
 * Fluxo de SUCESSO:
 *   PedidoCriado -> EstoqueReservado -> PagamentoAprovado -> CONFIRMADO
 *
 * Fluxo de FALHA (com Ação Compensatória):
 *   PedidoCriado -> EstoqueReservado -> PagamentoFalhou -> [ms-inventory
 *   reverte a reserva sozinho, ao escutar PagamentoFalhou] -> CANCELADO
 */
export class OrderSagaOrchestrator {
  constructor(private readonly prisma: PrismaClient) {}

  iniciar(): void {
    consumir(TOPICOS.ESTOQUE, (valor) => this.tratarEvento(JSON.parse(valor)));
    consumir(TOPICOS.PAGAMENTOS, (valor) => this.tratarEvento(JSON.parse(valor)));
    console.log('[ms-orders:Saga] orquestrador escutando eventos de estoque e pagamento');
  }

  private async tratarEvento(evento: EventoDoBarramento): Promise<void> {
    switch (evento.tipo) {
      case TIPOS_EVENTO.ESTOQUE_RESERVADO:
        return this.aoReservarEstoque(evento as EstoqueReservadoEvent);
      case TIPOS_EVENTO.PAGAMENTO_APROVADO:
        return this.aoAprovarPagamento(evento as PagamentoAprovadoEvent);
      case TIPOS_EVENTO.PAGAMENTO_FALHOU:
        return this.aoFalharPagamento(evento as PagamentoFalhouEvent);
      default:
        return; // EstoqueRevertidoEvent, por exemplo, não exige ação do orquestrador aqui.
    }
  }

  private async aoReservarEstoque(evento: EstoqueReservadoEvent): Promise<void> {
    console.log(`[ms-orders:Saga] estoque reservado para pedido ${evento.pedidoId} -> aguardando pagamento`);
    // GUARDA CONTRA REORDENAÇÃO: EstoqueReservadoEvent e PagamentoAprovado/
    // FalhouEvent chegam por DOIS consumidores independentes (tópicos
    // diferentes), sem garantia de ordem relativa entre si. Sob carga, o
    // evento de pagamento (mais rápido) pode ser processado e gravar o
    // status FINAL antes deste evento de reserva (mais lento) ser
    // processado — e sem esta condição no `where`, esta atualização
    // sobrescreveria CONFIRMADO/CANCELADO de volta para AGUARDANDO_PAGAMENTO,
    // deixando o pedido preso para sempre. `updateMany` com `status:
    // 'PENDENTE'` faz esta transição só avançar, nunca regredir um estado
    // terminal já alcançado.
    await this.prisma.pedidoModel.updateMany({
      where: { id: evento.pedidoId, status: 'PENDENTE' },
      data: { status: 'AGUARDANDO_PAGAMENTO' },
    });
  }

  private async aoAprovarPagamento(evento: PagamentoAprovadoEvent): Promise<void> {
    console.log(`[ms-orders:Saga] pagamento aprovado para pedido ${evento.pedidoId} -> Saga concluída com SUCESSO`);
    await this.prisma.pedidoModel.update({
      where: { id: evento.pedidoId },
      data: { status: 'CONFIRMADO' },
    });
  }

  private async aoFalharPagamento(evento: PagamentoFalhouEvent): Promise<void> {
    console.warn(
      `[ms-orders:Saga] pagamento FALHOU para pedido ${evento.pedidoId} (motivo: ${evento.payload.motivo}) -> ` +
        'ms-inventory disparará a Ação Compensatória automaticamente. Marcando pedido como CANCELADO.',
    );
    await this.prisma.pedidoModel.update({
      where: { id: evento.pedidoId },
      data: { status: 'CANCELADO' },
    });
  }
}
