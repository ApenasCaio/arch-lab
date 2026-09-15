/**
 * DTOs (Data Transfer Objects) de entrada/saída do caso de uso.
 *
 * DTOs são estruturas "burras" (sem regra de negócio) que atravessam a
 * fronteira entre a camada de Apresentação e a camada de Aplicação. Isso
 * evita que o Controller precise conhecer as entidades de domínio.
 */
export interface ItemPedidoDTO {
  produtoId: string;
  quantidade: number;
  precoUnitario: number;
}

export interface CriarPedidoInputDTO {
  clienteId: string;
  itens: ItemPedidoDTO[];
}

export interface PedidoOutputDTO {
  id: string;
  clienteId: string;
  status: string;
  valorTotal: number;
  itens: ItemPedidoDTO[];
}
