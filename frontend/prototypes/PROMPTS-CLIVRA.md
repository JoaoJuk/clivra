# Prévias CLIVRA — prompts finais

Geradas com a ferramenta interna de imagem, como prévias visuais para aprovação. Dados, nomes e valores são fictícios. Referência de identidade: `acesso-v2-mobile.png`.

## Direção compartilhada

Tela PWA de iPhone, 390 px de largura, enquadramento frontal sem moldura. Identidade CLIVRA: fundo branco, texto azul-marinho `#102a31`, acentos verde-petróleo `#0a7168`, menta discreta, divisórias cinza-claro, texto em português do Brasil e alvos de toque confortáveis. Abas inferiores: Início, Gastos, Pendências, Cartões e Ajustes. Bancos da v1: Nubank e Itaú. Categorias vêm da lista fechada da API; compras desconhecidas ficam sem categoria.

## Telas

- **Início:** resumo líquido de outubro de 2026, comparação com mês anterior, aviso de duas compras a classificar, gastos por categoria e transações recentes.
- **Gastos:** total do mês, meta global com progresso e aviso aos 80%, rosca por categoria e evolução mensal com linha tracejada da meta. Marcar o mês atual como parcial e compará-lo somente quando o período for equivalente. A lista de compras vem abaixo dos gráficos. Compras pendentes aparecem como **Não categorizado**.
- **Pendências:** pergunta sobre `PAG*JL2201`, valor fictício de R$ 89,90 em 13 de outubro, opções de categoria em um toque e explicação de que a escolha será lembrada.
- **Cartões:** dois cartões fictícios, Nubank e Itaú, com final, vencimento, fechamento e ação para adicionar cartão.
- **Ajustes:** perfil fictício, avisos de categoria, regras aprendidas, exportação, dados locais e saída da conta.

As imagens são propostas de aparência. Na implementação, valores, cartões, categorias e estados virão do contrato da API, sem fixar os exemplos nos componentes.
