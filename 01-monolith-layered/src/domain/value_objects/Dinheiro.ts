import { MoedaIncompativelException, ValorTotalInvalidoException } from '../exceptions/DomainException';

/**
 * Value Object "Dinheiro".
 *
 * Value Objects não têm identidade própria — são definidos pelos seus valores
 * e são sempre IMUTÁVEIS. Qualquer operação retorna uma NOVA instância.
 * Guardamos o valor em centavos (inteiro) para evitar erros de arredondamento
 * de ponto flutuante em cálculos financeiros.
 */
export class Dinheiro {
  private readonly centavos: number;
  private readonly moeda: string;

  private constructor(centavos: number, moeda: string) {
    if (!Number.isInteger(centavos) || centavos < 0) {
      throw new ValorTotalInvalidoException(centavos / 100);
    }
    this.centavos = centavos;
    this.moeda = moeda;
  }

  static deReais(valor: number, moeda: string = 'BRL'): Dinheiro {
    return new Dinheiro(Math.round(valor * 100), moeda);
  }

  static zero(moeda: string = 'BRL'): Dinheiro {
    return new Dinheiro(0, moeda);
  }

  somar(outro: Dinheiro): Dinheiro {
    this.garantirMesmaMoeda(outro);
    return new Dinheiro(this.centavos + outro.centavos, this.moeda);
  }

  multiplicar(fator: number): Dinheiro {
    return new Dinheiro(Math.round(this.centavos * fator), this.moeda);
  }

  get valorEmReais(): number {
    return this.centavos / 100;
  }

  get codigoMoeda(): string {
    return this.moeda;
  }

  ehNegativo(): boolean {
    return this.centavos < 0;
  }

  private garantirMesmaMoeda(outro: Dinheiro): void {
    if (this.moeda !== outro.moeda) {
      throw new MoedaIncompativelException(this.moeda, outro.moeda);
    }
  }

  toString(): string {
    return `${this.moeda} ${this.valorEmReais.toFixed(2)}`;
  }
}
