import { randomUUID } from 'crypto';

export interface ResultadoPagamento {
  aprovado: boolean;
  transacaoId?: string;
  motivoFalha?: string;
}

/**
 * Simulador de gateway de pagamento (Camada de Domínio de ms-payments).
 *
 * Para fins DIDÁTICOS, o resultado do pagamento é induzido de forma
 * determinística e controlável, para que o professor consiga, ao vivo,
 * disparar o fluxo de Saga com Ação Compensatória:
 *   1. Se `clienteId` terminar com o sufixo de falha (padrão: "-falha"),
 *      o pagamento é recusado com "saldo insuficiente" — SEMPRE.
 *   2. Se terminar com o sufixo de sucesso (padrão: "-sucesso"), o
 *      pagamento é aprovado — SEMPRE, ignorando a falha aleatória abaixo.
 *      Isso existe para que o botão "Disparar pedido de SUCESSO" do
 *      dashboard seja 100% confiável — sem ele, a falha espontânea (item 3)
 *      podia fazer até esse botão "de sucesso garantido" cair em CANCELADO
 *      de vez em quando, o que só confundia quem está estudando o fluxo.
 *   3. Em qualquer OUTRO caso (uma chamada "orgânica", sem sufixo), a
 *      chance de falha aleatória é controlada por TAXA_FALHA_ALEATORIA
 *      (env var), simulando falhas "espontâneas" do mundo real.
 */
export class ProcessadorPagamento {
  private readonly sufixoForcaFalha = process.env.SUFIXO_CLIENTE_FALHA ?? '-falha';
  private readonly sufixoForcaSucesso = process.env.SUFIXO_CLIENTE_SUCESSO ?? '-sucesso';
  private readonly taxaFalhaAleatoria = Number(process.env.TAXA_FALHA_ALEATORIA ?? 0.2);

  processar(clienteId: string, valorTotal: number): ResultadoPagamento {
    if (clienteId.endsWith(this.sufixoForcaFalha)) {
      return { aprovado: false, motivoFalha: 'Saldo insuficiente (falha forçada para demonstração)' };
    }

    if (clienteId.endsWith(this.sufixoForcaSucesso)) {
      return { aprovado: true, transacaoId: randomUUID() };
    }

    if (Math.random() < this.taxaFalhaAleatoria) {
      return { aprovado: false, motivoFalha: 'Saldo insuficiente' };
    }

    return { aprovado: true, transacaoId: randomUUID() };
  }
}
