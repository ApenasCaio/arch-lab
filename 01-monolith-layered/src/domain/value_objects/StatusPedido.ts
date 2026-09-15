/**
 * Value Object "StatusPedido".
 *
 * Enum que representa o ciclo de vida de um Pedido dentro do monolito.
 * As transições válidas são reforçadas pela própria entidade Pedido
 * (ver domain/entities/Pedido.ts), nunca pela camada de aplicação.
 */
export enum StatusPedido {
  PENDENTE = 'PENDENTE',
  PAGO = 'PAGO',
  CANCELADO = 'CANCELADO',
}

const TRANSICOES_VALIDAS: Record<StatusPedido, StatusPedido[]> = {
  [StatusPedido.PENDENTE]: [StatusPedido.PAGO, StatusPedido.CANCELADO],
  [StatusPedido.PAGO]: [],
  [StatusPedido.CANCELADO]: [],
};

export function transicaoEhValida(atual: StatusPedido, destino: StatusPedido): boolean {
  return TRANSICOES_VALIDAS[atual].includes(destino);
}
