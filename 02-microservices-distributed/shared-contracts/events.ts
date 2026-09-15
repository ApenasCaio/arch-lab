/**
 * Contratos de Eventos compartilhados pelo Barramento de Mensagens (Kafka).
 *
 * Este é o ÚNICO artefato de código compartilhado entre os microsserviços —
 * e mesmo assim, ele contém apenas TIPOS/FORMATOS de payload, nunca lógica
 * de negócio. Cada serviço é livre para copiar este arquivo para seu próprio
 * build (em um monorepo real, isto seria publicado como um pacote npm
 * privado versionado, ex: @acme/shared-contracts).
 *
 * Padrão de nomenclatura: eventos são fatos que JÁ ocorreram, por isso os
 * nomes estão no passado (Criado, Reservado, Aprovado, Falhou, Revertido).
 */

export const TOPICOS = {
  PEDIDOS: 'pedidos.eventos',
  ESTOQUE: 'estoque.eventos',
  PAGAMENTOS: 'pagamentos.eventos',
} as const;

export const TIPOS_EVENTO = {
  PEDIDO_CRIADO: 'PedidoCriadoEvent',
  ESTOQUE_RESERVADO: 'EstoqueReservadoEvent',
  PAGAMENTO_APROVADO: 'PagamentoAprovadoEvent',
  PAGAMENTO_FALHOU: 'PagamentoFalhouEvent',
  ESTOQUE_REVERTIDO: 'EstoqueRevertidoEvent',
} as const;

interface ItemEventoPayload {
  produtoId: string;
  quantidade: number;
  precoUnitario: number;
}

/** ms-inventory só lida com quantidades — preço não faz parte do seu domínio. */
interface ItemEstoquePayload {
  produtoId: string;
  quantidade: number;
}

/** Envelope genérico: todo evento do barramento carrega estes metadados. */
interface EventoBase<TTipo extends string, TPayload> {
  eventoId: string;
  tipo: TTipo;
  pedidoId: string;
  ocorridoEm: string; // ISO-8601
  payload: TPayload;
}

/** Publicado por ms-orders (via Transactional Outbox) ao criar um pedido. */
export type PedidoCriadoEvent = EventoBase<
  typeof TIPOS_EVENTO.PEDIDO_CRIADO,
  {
    clienteId: string;
    itens: ItemEventoPayload[];
    valorTotal: number;
  }
>;

/** Publicado por ms-inventory após reservar com sucesso os itens do pedido. */
export type EstoqueReservadoEvent = EventoBase<
  typeof TIPOS_EVENTO.ESTOQUE_RESERVADO,
  {
    itensReservados: ItemEstoquePayload[];
  }
>;

/** Publicado por ms-payments quando o pagamento simulado é aprovado. */
export type PagamentoAprovadoEvent = EventoBase<
  typeof TIPOS_EVENTO.PAGAMENTO_APROVADO,
  {
    valorPago: number;
    transacaoId: string;
  }
>;

/** Publicado por ms-payments quando o pagamento simulado falha (ex: saldo insuficiente). */
export type PagamentoFalhouEvent = EventoBase<
  typeof TIPOS_EVENTO.PAGAMENTO_FALHOU,
  {
    motivo: string;
  }
>;

/** Publicado por ms-inventory após executar a Ação Compensatória da Saga. */
export type EstoqueRevertidoEvent = EventoBase<
  typeof TIPOS_EVENTO.ESTOQUE_REVERTIDO,
  {
    itensRevertidos: ItemEstoquePayload[];
    motivo: string;
  }
>;

export type EventoDoBarramento =
  | PedidoCriadoEvent
  | EstoqueReservadoEvent
  | PagamentoAprovadoEvent
  | PagamentoFalhouEvent
  | EstoqueRevertidoEvent;
