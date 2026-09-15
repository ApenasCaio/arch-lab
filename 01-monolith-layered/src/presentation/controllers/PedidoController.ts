import { Request, Response, Router } from 'express';
import { ZodError } from 'zod';
import { CriarPedidoUseCase } from '../../application/use_cases/CriarPedidoUseCase';
import { DomainException } from '../../domain/exceptions/DomainException';
import { criarPedidoSchema } from '../schemas/pedidoSchema';

/**
 * Endpoint HTTP `POST /pedidos`. Nunca acessa Domínio ou Infraestrutura
 * diretamente — apenas valida sintaxe e delega ao Caso de Uso.
 */
export function criarPedidoController(criarPedidoUseCase: CriarPedidoUseCase): Router {
  const router = Router();

  router.post('/pedidos', async (req: Request, res: Response) => {
    console.log('[Presentation:Controller] POST /pedidos recebido ->', JSON.stringify(req.body));
    try {
      const dadosValidados = criarPedidoSchema.parse(req.body);

      console.log('[Presentation:Controller] payload válido -> delegando ao Application:UseCase');
      const pedido = await criarPedidoUseCase.executar(dadosValidados);

      console.log('[Presentation:Controller] pedido criado com sucesso, id =', pedido.id);
      return res.status(201).json(pedido);
    } catch (erro) {
      return tratarErro(erro, res);
    }
  });

  return router;
}

function tratarErro(erro: unknown, res: Response): Response {
  if (erro instanceof ZodError) {
    console.warn('[Presentation:Controller] 400 - payload sintaticamente inválido');
    return res.status(400).json({ erro: 'Requisição inválida', detalhes: erro.issues });
  }

  if (erro instanceof DomainException) {
    console.warn('[Presentation:Controller] 400 - violação de regra de domínio:', erro.message);
    return res.status(400).json({ erro: erro.message });
  }

  console.error('[Presentation:Controller] 500 - erro inesperado:', erro);
  return res.status(500).json({ erro: 'Erro interno do servidor' });
}
