import express from 'express';
import { montarContainer } from './config/container';
import { criarPedidoController } from './presentation/controllers/PedidoController';

/**
 * Um único deploy contém Apresentação, Aplicação, Domínio e Infraestrutura.
 * Uma requisição HTTP percorre todas as camadas dentro do mesmo processo e
 * do mesmo bloco transacional — sem chamada de rede entre camadas. Compare
 * isto ao ecossistema de microsserviços em `02-microservices-distributed/`.
 */
const app = express();
app.use(express.json());

const { criarPedidoUseCase } = montarContainer();
app.use(criarPedidoController(criarPedidoUseCase));

const PORTA = process.env.PORT ?? 3000;
app.listen(PORTA, () => {
  console.log(`[Monolito] Servidor de 5 camadas escutando na porta ${PORTA}`);
});
