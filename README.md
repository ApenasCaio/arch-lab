# Arquitetura de Software na Prática: Monolito em Camadas vs. Microsserviços Distribuídos

Este repositório é o artefato prático de um seminário de Arquitetura de Software (graduação em Engenharia de Software) e implementa, lado a lado, duas formas de organizar o mesmo domínio de negócio — **criação de pedidos** — sob dois estilos arquiteturais fundamentalmente diferentes:

1. **`01-monolith-layered/`** — um monolito modular em **5 camadas**, com Clean Architecture, DDD tático e Inversão de Dependência.
2. **`02-microservices-distributed/`** — um ecossistema **Event-Driven** de microsserviços, com **Transactional Outbox**, **Saga Orquestrada** e **Ações Compensatórias**.

Stack: **TypeScript** de ponta a ponta (Node.js + Express + Prisma), para que os dois estilos sejam comparáveis sem a variável "linguagem diferente" introduzindo ruído na análise. O repositório roda **100% com Node.js — sem Docker, sem instalar Postgres/Redis/Kafka**: o monolito usa SQLite (um arquivo), e os microsserviços usam um pequeno broker HTTP próprio (`02-microservices-distributed/broker`) no lugar do Kafka, construído apenas para os fins desta demonstração.

---

## 1. Fundamentação Teórica

### 1.1 Separação de responsabilidades em camadas

A decomposição de um sistema em camadas com responsabilidades distintas remonta a **Dijkstra (1968)**, em *"The Structure of the 'THE'-Multiprogramming System"*, no qual se demonstra que organizar um sistema operacional em níveis hierárquicos — cada um dependendo apenas dos níveis inferiores — reduz a complexidade cognitiva de raciocinar sobre o sistema como um todo. Esse princípio, **camadas superiores dependem de camadas inferiores, nunca o contrário**, é o ancestral direto da regra de dependência empregada hoje em Clean Architecture.

**Garlan & Shaw (1994)**, em *"An Introduction to Software Architecture"*, formalizam essa ideia como um **estilo arquitetural**: o *Layered System*, no qual cada camada oferece serviços à camada imediatamente superior e consome serviços da camada imediatamente inferior. Duas propriedades destacadas pelos autores são reproduzidas no módulo `01-monolith-layered`:

- **Substituibilidade**: uma camada pode ser reimplementada sem afetar as demais, desde que a interface entre elas seja preservada (papel exercido por `PedidoRepository`, a interface pura do domínio).
- **Localidade de mudança**: alterações tendem a ficar contidas dentro de uma única camada.

No código deste repositório, isso se traduz em uma regra de dependência estrita:

```
Apresentação -> Aplicação -> Domínio <- Infraestrutura
```

A seta invertida entre Infraestrutura e Domínio corresponde ao **Dependency Inversion Principle**: o Domínio define o contrato (`domain/repositories/PedidoRepository.ts`), e a Infraestrutura o implementa (`infrastructure/repositories/PedidoRepositoryPrisma.ts`). O Domínio não importa nada de `infrastructure/`.

### 1.2 "Monolith First" (Martin Fowler)

**Martin Fowler**, em *"MonolithFirst"* (2015), argumenta que equipes deveriam, salvo exceções pontuais, **iniciar com um monolito bem modularizado** e migrar para microsserviços apenas quando a dor de manter o monolito superar a dor operacional de distribuir o sistema. Os principais riscos da adoção prematura de microsserviços apontados pelo autor — e que este repositório procura tornar observáveis — são:

- **Os limites de serviço (bounded contexts) raramente são acertados na primeira tentativa.** Redesenhar fronteiras de serviço é substancialmente mais custoso do que redesenhar módulos dentro de um monolito, pois exige migração de dados entre bancos isolados e coordenação entre times.
- **Complexidade operacional imediata**: um sistema distribuído introduz, desde o primeiro dia, a necessidade de um barramento de mensagens, múltiplos bancos de dados, observabilidade distribuída (tracing, correlação de logs) e o tratamento de **falhas parciais** — algo inexistente dentro de um único processo.
- **A consistência deixa de ser trivial.** Um monolito obtém transações ACID "de graça" via o SGBD. Um sistema distribuído exige **desenho explícito** da estratégia de consistência (ver Seção 1.3 e o padrão Saga implementado em `ms-orders`).

A recomendação de Fowler não é "nunca usar microsserviços", mas sim: **compreender o domínio suficientemente através de um monolito modular antes de arcar com o custo da distribuição.** Este repositório existe para tornar esse custo visível e comparável empiricamente.

### 1.3 Consistência: ACID local vs. Sagas

No monolito, `UnitOfWorkPrisma.executar()` abre um único `BEGIN`, executa todas as operações e realiza `COMMIT` (ou `ROLLBACK` automático em caso de exceção) — a garantia **ACID** clássica de um único banco de dados.

Em um ecossistema distribuído, **não existe transação distribuída de baixo custo** (2PC/XA é frágil e caro em escala). A alternativa consolidada na literatura é o **padrão Saga**: uma sequência de transações locais, cada uma publicando um evento que dispara a etapa seguinte. Quando uma etapa falha, o sistema executa **ações compensatórias** — transações locais que revertem semanticamente o efeito das etapas anteriores. Troca-se, assim, uma garantia forte (atomicidade imediata) por uma mais fraca, porém suficiente na prática: **consistência eventual**.

---

## 2. Tabela Comparativa de Arquiteturas

| Dimensão | `01-monolith-layered` (Monolito em Camadas) | `02-microservices-distributed` (Microsserviços) |
|---|---|---|
| **Coesão vs. Acoplamento** | Alta coesão por camada; acoplamento controlado por interfaces internas (mesmo processo, mesmo binário). | Alta autonomia entre serviços (baixo acoplamento de deploy), mas acoplamento *implícito* via contrato de eventos (`shared-contracts/events.ts`) — mudar o formato de um evento é uma mudança "distribuída". |
| **Comunicação** | Chamadas em memória (function calls). Latência desprezível, sem falhas de rede. | Comunicação via rede + barramento de mensagens (aqui, um broker HTTP próprio no papel do Kafka). Sujeita a latência e falhas parciais. |
| **Consistência** | Transações ACID locais (`BEGIN/COMMIT/ROLLBACK` em um único SGBD). Forte e imediata. | Consistência eventual via Saga Orquestrada + Ações Compensatórias. Existe uma janela de tempo em que o sistema está temporariamente inconsistente. |
| **Persistência** | Um único banco de dados compartilhado por todas as camadas. | *Database per Service*: `ms-orders` (SQLite próprio) e `ms-inventory` (Map em memória) são totalmente isolados; nenhum serviço acessa o banco de outro diretamente. |
| **Observabilidade** | Um único log, um único processo, um único stack trace por requisição. Depuração trivial com breakpoint local. | Requer correlacionar logs de múltiplos processos (ver `pedidoId` propagado em todos os eventos como *correlation id*); em produção, idealmente exigiria tracing distribuído (ex.: OpenTelemetry). |
| **Deploy** | Um artefato, um pipeline, um versionamento. Deploy simples, porém "tudo ou nada" (qualquer mudança exige redeploy do monolito inteiro). | Deploy independente por serviço — permite releases mais frequentes e isolados, ao custo de gerenciar compatibilidade entre versões de eventos e orquestração de múltiplos pipelines. |
| **Escalabilidade** | Escala o processo inteiro (vertical ou réplicas idênticas). | Escala cada serviço independentemente conforme sua própria demanda (ex.: `ms-payments` pode escalar sem escalar `ms-orders`). |
| **Curva de adoção** | Baixa: qualquer desenvolvedor backend consegue executar e depurar localmente em minutos. | Alta: exige infraestrutura de mensageria, múltiplos bancos, e compreensão de padrões de consistência distribuída antes mesmo da primeira feature. |

---

## 3. Estrutura do Repositório

```text
software-architecture-demo/
├── README.md
├── package.json                        # `npm start` — abre a Central de Arquiteturas (web, raiz, sem cd)
├── dashboard/                          # painel web (grafo estilo Obsidian): iniciar/parar/status/logs
│   ├── server.mjs                      # orquestra os processos Node de cada serviço (sem Docker)
│   └── public/index.html               # o grafo interativo (canvas) + painel lateral de ações
│
├── 01-monolith-layered/                # Camadas 1..4 dentro de um único processo (SQLite local)
│   ├── src/
│   │   ├── presentation/                # Camada 1 - Controllers HTTP + Schemas (Zod)
│   │   ├── application/                 # Camada 2 - Casos de Uso (orquestração)
│   │   ├── domain/                      # Camada 3 - Entidades, VOs, exceções, contratos
│   │   ├── infrastructure/              # Camada 4 - Prisma (repositório concreto + UoW)
│   │   └── config/container.ts          # Composition Root (injeção de dependência)
│   └── tests/
│
└── 02-microservices-distributed/
    ├── broker/                          # substituto do Kafka para esta demonstração (HTTP + long-polling)
    ├── api-gateway/                     # único ponto de entrada HTTP externo
    ├── ms-orders/                       # dono do Pedido; Transactional Outbox + Saga (SQLite)
    ├── ms-inventory/                    # reserva de estoque + ação compensatória (em memória)
    ├── ms-payments/                     # pagamento simulado, com falhas induzidas
    └── shared-contracts/events.ts       # formato dos eventos trafegados no broker
```

---

## 4. Execução e Procedimento de Verificação Empírica

### 4.1 Preparação — Central de Arquiteturas (dashboard web, sem `cd`, sem Docker)

A raiz do repositório expõe um **painel web** que inicializa qualquer uma das duas arquiteturas com um clique, sem necessidade de navegar manualmente até `01-monolith-layered/` ou `02-microservices-distributed/`, nem instalar nada além do Node.js:

```bash
npm start
```

Isso abre um servidor local em **http://localhost:4000** e inicia a preparação das duas arquiteturas (executando `npm install` em cada serviço automaticamente, na primeira vez). A URL expõe um **grafo interativo** (no estilo "graph view" do Obsidian) que representa a arquitetura real, não apenas um nó por arquitetura:

- **Monolito com as 5 camadas explícitas**: em vez de um único nó, o Monolito é representado como uma **cadeia de 5 caixas empilhadas** — Apresentação → Aplicação → Domínio → Persistência → Banco de Dados. Todas compartilham o mesmo processo (um único deploy), mas permanecem visualmente distintas e conectadas em série.
- **Microsserviços com a topologia real**: Cliente → API Gateway → ms-orders (Outbox) → Broker → ms-inventory/ms-payments, com linhas **sólidas** para chamadas síncronas (HTTP) e **tracejadas** para eventos assíncronos (via broker).
- **Cores por status**: azul = Monolito, verde-água = Microsserviços, verde = processo em execução, cinza = parado, vermelho = erro, roxo = preparando/instalando/evento em andamento (ver legenda no canto superior esquerdo).
- Nós podem ser arrastados para reorganizar o grafo; o zoom é controlado pelo scroll ou pelos botões `+`/`–`/`⟲` no canto inferior direito.
- Clicar em um nó abre o painel lateral com **Iniciar**, **Parar**, **Abrir aplicação**, **Ver logs ao vivo** e um botão para **disparar um pedido de teste**.

### 4.1.1 Visualização do fluxo de requisição no grafo

O grafo mantém duas conexões SSE permanentes com o backend; cada evento real de log (instrumentado nas camadas do monolito e já existente nos microsserviços) aciona um marcador visual que percorre a aresta correspondente entre os nós, acompanhando a posição atual de cada um mesmo durante uma reorganização manual do grafo. Uma legenda no rodapé descreve cada etapa.

- No painel do nó **Monolito** (ou de qualquer uma das 5 camadas), o botão **"Disparar pedido de teste"** exibe o percurso Apresentação → Aplicação → Domínio → Persistência → Banco, retornando como `201 Created`.
- No painel do nó **Microsserviços** (ou de qualquer serviço), os botões **"Disparar pedido de SUCESSO"** e **"Disparar pedido com FALHA forçada"** permitem comparar, em tempo real, o caminho feliz (`PedidoCriadoEvent → EstoqueReservadoEvent → PagamentoAprovadoEvent → CONFIRMADO`) com o caminho de compensação da Saga (`PagamentoFalhouEvent → ms-inventory reverte a reserva → EstoqueRevertidoEvent → CANCELADO`).

Cada botão do painel apenas inicia ou encerra os mesmos processos Node executáveis manualmente via `npm run dev` em cada pasta — nenhuma lógica de negócio reside no dashboard (`dashboard/server.mjs`), que atua somente como orquestrador. Os logs do painel lateral são exibidos apenas após o clique em "Ver logs ao vivo" e com a arquitetura já em execução; a animação do grafo, por sua vez, permanece escutando eventos em segundo plano independentemente disso.

> Execução manual, sem o dashboard: `cd 01-monolith-layered && npm install && npm run dev` (e o mesmo em cada pasta de `02-microservices-distributed/`, começando pelo `broker/`) — ver o `.env.example` de cada pasta.

> No painel do nó **"Microsserviços"**, a opção "Ver logs ao vivo" evidencia os eventos trafegando pelos tópicos `pedidos.eventos`, `estoque.eventos` e `pagamentos.eventos`. A página `http://localhost:4500/status` (o broker) complementa essa visão mostrando o volume de mensagens processadas por tópico.

### 4.2 Cenário 1 — Monolito: chamada atômica em camadas

Com o nó **Monolito** iniciado no dashboard (`http://localhost:4000`), a requisição a seguir pode ser disparada em um terminal:

```bash
curl -X POST http://localhost:3000/pedidos \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cliente-123","itens":[{"produtoId":"produto-1","quantidade":2,"precoUnitario":49.90}]}'
```

O log resultante evidencia a requisição **descendo a pilha em um único processo**:

```
[Presentation:Controller] POST /pedidos recebido -> {...}
[Presentation:Controller] payload válido -> delegando ao Application:UseCase
[Presentation:Controller] pedido criado com sucesso, id = ...
```

Observações relevantes sobre este cenário:
- Toda a operação ocorre **dentro do mesmo `BEGIN`/`COMMIT`** (`UnitOfWorkPrisma`) — não há janela de inconsistência.
- Não há chamada de rede entre "camadas": são apenas chamadas de função em memória.
- Um pedido **sem itens** retorna `400 Bad Request` a partir de uma `DomainException` (`PedidoSemItensException`), evidenciando que a regra de negócio está protegida no Domínio, não no Controller.

### 4.3 Cenário 2 — Microsserviços: Saga de sucesso

Com o nó **Microsserviços** iniciado no dashboard, a requisição a seguir passa pelo API Gateway (acompanhável em "Ver logs ao vivo"):

```bash
curl -X POST http://localhost:8090/pedidos \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cliente-456","itens":[{"produtoId":"produto-1","quantidade":1,"precoUnitario":99.90}]}'
```

Sequência esperada no painel de logs do dashboard:

```
[ms-orders]      pedido ... persistido + evento gravado no Outbox (transação local ACID)
[ms-orders:OutboxPublisher]  evento 'PedidoCriadoEvent' publicado no broker
[ms-inventory]   PedidoCriadoEvent recebido -> itens reservados
[ms-inventory]   EstoqueReservadoEvent publicado
[ms-payments]    processando pagamento -> APROVADO
[ms-orders:Saga] pagamento aprovado -> Saga concluída com SUCESSO
```

Cada seta acima corresponde a uma **chamada de rede via HTTP (o broker)**, não a uma chamada de função. O pedido atravessa 3 processos e 2 armazenamentos distintos (SQLite do `ms-orders`, memória do `ms-inventory`) antes de atingir o estado `CONFIRMADO`.

### 4.4 Cenário 3 — Microsserviços: Saga de falha e ação compensatória

Um `clienteId` terminado em `-falha` força a recusa do pagamento (ver `ms-payments/src/domain/ProcessadorPagamento.ts`):

```bash
curl -X POST http://localhost:8090/pedidos \
  -H "Content-Type: application/json" \
  -d '{"clienteId":"cliente-789-falha","itens":[{"produtoId":"produto-1","quantidade":1,"precoUnitario":150.00}]}'
```

Logs esperados:

```
[ms-inventory]   EstoqueReservadoEvent publicado
[ms-payments]    pagamento FALHOU: Saldo insuficiente (falha forçada para demonstração) -> Saga entrará em compensação
[ms-inventory]   PagamentoFalhouEvent recebido -> disparando Ação Compensatória
[ms-inventory:Estoque] AÇÃO COMPENSATÓRIA executada - reserva revertida para pedido ...
[ms-inventory]   EstoqueRevertidoEvent publicado (consistência eventual restaurada)
[ms-orders:Saga] pagamento FALHOU -> marcando pedido como CANCELADO
```

Este cenário ilustra o ponto central da comparação: o **estoque é debitado e, em seguida, devolvido automaticamente**, sem nenhuma transação distribuída de baixo nível — apenas reação a eventos e uma transação local em cada serviço. Em um banco único, um simples `ROLLBACK` resolveria o mesmo problema; a diferença de custo entre as duas abordagens é o objeto central desta análise.

---

## 5. Requisitos

- Node.js 20+ (sem Docker, sem instalar Postgres/Redis/Kafka)
- (Opcional) `curl` ou Postman/Insomnia para disparar as requisições

Portas utilizadas: `3000` (Monolito), `3001` (ms-orders), `4500` (broker), `8090` (API Gateway) e `4000` (dashboard). Caso alguma porta já esteja em uso, o serviço correspondente pode ser executado manualmente com outra porta via variável de ambiente (ex.: `PORT=8091 npm run dev` dentro de `api-gateway/`), ajustando `dashboard/server.mjs` de acordo.
