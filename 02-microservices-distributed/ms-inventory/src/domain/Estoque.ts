interface ItemReserva {
  produtoId: string;
  quantidade: number;
}

/**
 * Domínio de Estoque — persistido em um banco CHAVE-VALOR EM MEMÓRIA,
 * totalmente ISOLADO dos demais serviços (nenhum outro processo consegue
 * acessar estes `Map`s). Cada chave `pedidoId` guarda os itens reservados
 * para aquele pedido, permitindo reverter exatamente o que foi reservado,
 * sem depender de nenhum outro serviço.
 *
 * Este `Map` é o "banco de dados" do ms-inventory: como o objetivo didático
 * é isolamento de dados entre serviços (e não durabilidade), um armazenamento
 * em memória do próprio processo já satisfaz o requisito — sem precisar de
 * Redis ou qualquer outro servidor externo.
 */
export class Estoque {
  private readonly saldos = new Map<string, number>();
  private readonly reservas = new Map<string, ItemReserva[]>();

  async reservarItens(pedidoId: string, itens: ItemReserva[]): Promise<void> {
    for (const item of itens) {
      const saldoAtual = this.saldos.get(item.produtoId) ?? 0;
      this.saldos.set(item.produtoId, saldoAtual - item.quantidade);
    }
    this.reservas.set(pedidoId, itens);
    console.log(`[ms-inventory:Estoque] itens reservados para pedido ${pedidoId}:`, itens);
  }

  /**
   * Ação Compensatória da Saga: desfaz exatamente a reserva feita para este
   * pedido, devolvendo as quantidades ao saldo. É isto que mantém o sistema
   * em Consistência Eventual após uma falha em outro serviço (ms-payments).
   */
  async reverterReservaEstoque(pedidoId: string): Promise<ItemReserva[]> {
    const itens = this.reservas.get(pedidoId);
    if (!itens) {
      console.warn(`[ms-inventory:Estoque] nenhuma reserva encontrada para pedido ${pedidoId}, nada a reverter`);
      return [];
    }

    for (const item of itens) {
      const saldoAtual = this.saldos.get(item.produtoId) ?? 0;
      this.saldos.set(item.produtoId, saldoAtual + item.quantidade);
    }
    this.reservas.delete(pedidoId);
    console.log(`[ms-inventory:Estoque] AÇÃO COMPENSATÓRIA executada - reserva revertida para pedido ${pedidoId}:`, itens);
    return itens;
  }

  async garantirSaldoInicial(produtoId: string, quantidade: number): Promise<void> {
    if (!this.saldos.has(produtoId)) {
      this.saldos.set(produtoId, quantidade);
    }
  }
}
