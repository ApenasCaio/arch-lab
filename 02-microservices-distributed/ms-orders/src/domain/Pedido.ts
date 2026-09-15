import { randomUUID } from 'crypto';

/**
 * Entidade Pedido — cópia ISOLADA e simplificada dentro do contexto do
 * ms-orders. Em microsserviços, cada serviço possui seu próprio modelo de
 * domínio (Bounded Context), mesmo que o "Pedido" também exista, com outro
 * significado/atributos, em ms-inventory ou ms-payments. Não há
 * compartilhamento de entidades entre serviços — apenas de eventos.
 */
export type StatusPedido = 'PENDENTE' | 'AGUARDANDO_ESTOQUE' | 'AGUARDANDO_PAGAMENTO' | 'CONFIRMADO' | 'CANCELADO';

export interface ItemPedido {
  produtoId: string;
  quantidade: number;
  precoUnitario: number;
}

export class Pedido {
  private constructor(
    readonly id: string,
    readonly clienteId: string,
    readonly itens: ItemPedido[],
    public status: StatusPedido,
  ) {}

  static criar(clienteId: string, itens: ItemPedido[]): Pedido {
    if (itens.length === 0) {
      throw new Error('Pedido precisa conter ao menos um item.');
    }
    return new Pedido(randomUUID(), clienteId, itens, 'PENDENTE');
  }

  static reconstituir(id: string, clienteId: string, itens: ItemPedido[], status: StatusPedido): Pedido {
    return new Pedido(id, clienteId, itens, status);
  }

  get valorTotal(): number {
    return this.itens.reduce((acc, item) => acc + item.quantidade * item.precoUnitario, 0);
  }
}
