/**
 * O domínio nunca lança exceções de framework (ex: erros do Express ou do
 * Prisma) — apenas exceções próprias, ricas em significado de negócio. A
 * camada de apresentação (controllers) traduz essas exceções para códigos HTTP.
 */

export abstract class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValorTotalInvalidoException extends DomainException {
  constructor(valor: number) {
    super(`Valor total do pedido não pode ser negativo. Valor recebido: ${valor}`);
  }
}

export class TransicaoDeStatusInvalidaException extends DomainException {
  constructor(statusAtual: string, statusDestino: string) {
    super(`Não é possível transicionar o pedido de '${statusAtual}' para '${statusDestino}'.`);
  }
}

export class PedidoSemItensException extends DomainException {
  constructor() {
    super('Um pedido precisa conter ao menos um item.');
  }
}

export class MoedaIncompativelException extends DomainException {
  constructor(moedaA: string, moedaB: string) {
    super(`Não é possível operar valores em moedas diferentes: ${moedaA} != ${moedaB}`);
  }
}

export class PedidoNaoEncontradoException extends DomainException {
  constructor(pedidoId: string) {
    super(`Pedido '${pedidoId}' não encontrado.`);
  }
}
