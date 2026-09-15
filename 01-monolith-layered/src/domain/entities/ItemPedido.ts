import { Dinheiro } from '../value_objects/Dinheiro';

/**
 * Entidade filha "ItemPedido". Vive apenas dentro do agregado Pedido
 * (Domain-Driven Design: Pedido é a Aggregate Root, ItemPedido não deve
 * ser persistido ou acessado fora dessa fronteira).
 */
export class ItemPedido {
  constructor(
    readonly produtoId: string,
    readonly quantidade: number,
    readonly precoUnitario: Dinheiro,
  ) {}

  get subtotal(): Dinheiro {
    return this.precoUnitario.multiplicar(this.quantidade);
  }
}
