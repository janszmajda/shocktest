Your challenge is to **design and build advanced trading tools for Polymarket that help users better understand, visualize, and manage risk across time, price, and probability.**

Participants should build applications that leverage Polymarket markets and data to create **TradFi-style trading experiences**, such as:

* Profit & loss visualizations across different probability outcomes and time horizons e.g. https://www.optionsprofitcalculator.com/  
* Hedging tools that pair prediction markets with other speculative positions (e.g., options, perps, spot, or synthetic exposure)  
* Scenario analysis tools that show how a position performs if an event resolves sooner vs later  
* Portfolio or strategy views that combine multiple markets into a single payoff graph  
* Educational visualizations that make complex strategies easier to understand and trade

The goal is to **unlock more sophisticated trading behavior by making prediction markets easier to reason about, experiment with, and trust**, especially for users coming from traditional trading or crypto-native derivatives.

---

### **3\. Requirements / What to Build**

Submissions should demonstrate a **working, end-to-end trading or visualization tool** that meaningfully improves how users understand and interact with prediction markets.

**Projects should:**

* **Use real or realistic Polymarket market data**  
  This can include live markets, historical market data, or clearly labeled simulated data derived from real Polymarket contracts. Assumptions and simplifications should be made explicit.

* **Provide a functional demo with clear user interaction**  
  Submissions should allow a user to input positions, strategies, or parameters (e.g., probabilities, time horizons, multiple markets) and see outputs update dynamically.

* **Produce concrete analytical or visual outputs**  
  Examples include (but are not limited to): payoff curves, scenario trees, time-based profit/loss charts, portfolio payoff surfaces, correlation views, inefficiency indicators, or strategy comparisons across markets.

* **Be grounded in real trading use cases**  
  The tool should plausibly help a trader make better decisions, manage risk, identify inefficiencies, or understand tradeoffs before placing a trade.

Submissions can come in various forms, such as but not limited to web apps, dashboards, visual simulators, or analytical tools.

---

### **4\. Evaluation Criteria**

We will prioritize projects that demonstrate:

1. Quality of insight and correctness of modeling  
   1. Sound reasoning around probabilities, payoffs, correlations, and resolution timing. Clear, defensible assumptions matter more than complexity for its own sake.

2. Strength of visualization and user experience  
   1. Interfaces that make complex strategies, risks, and tradeoffs intuitive and easy to understand. Great UX that helps users *see* what happens across time, price, and outcomes will be heavily rewarded.

3. Technical depth and execution  
   1. Thoughtful use of data, calculations, and system design. Bonus for handling multi-market interactions, non-mutually exclusive events, or correlated outcomes in a robust way.

4. Real-world trading applicability   
   1. The tool should plausibly help real traders make better decisions, manage risk, or identify inefficiencies.

5. Creativity and originality  
   1. Novel approaches to prediction market tooling, strategy construction, or educational visualization. We value new mental models and workflows, not clones of existing dashboards.

6. Clarity of explanation  
   1. Teams should be able to clearly explain what their tool does, why it matters, and how a trader would actually use it.

---

### **5\. APIs, SDKs, or Tools Provided**

*(Developer resources)*

Please list what hackers will have access to:

* APIs or endpoints  
* SDKs (languages supported)  
* Builder API Keys @ [https://polymarket.com/settings?tab=builder](https://polymarket.com/settings?tab=builder)

**Resources:**

* Documentation: [https://docs.polymarket.com/quickstart/overview](https://docs.polymarket.com/quickstart/overview)  
* API References:   
  * CLOB endpoints: [https://docs.polymarket.com/api-reference/orderbook/get-order-book-summary](https://docs.polymarket.com/api-reference/orderbook/get-order-book-summary)  
  * Gamma endpoints: [https://docs.polymarket.com/api-reference/gamma-status](https://docs.polymarket.com/api-reference/gamma-status)  
  * Data API: [https://docs.polymarket.com/api-reference/data-api-status/data-api-health-check](https://docs.polymarket.com/api-reference/data-api-status/data-api-health-check)  
* Websockets:  
  * [https://docs.polymarket.com/developers/CLOB/websocket/wss-overview](https://docs.polymarket.com/developers/CLOB/websocket/wss-overview)  
* SDKs:  
  * Typescript CLOB client: [https://github.com/Polymarket/clob-client](https://github.com/Polymarket/clob-client)  
  * Typescript Relay client: [https://github.com/Polymarket/builder-relayer-client](https://github.com/Polymarket/builder-relayer-client)  
  * Python CLOB client: [https://github.com/Polymarket/py-clob-client](https://github.com/Polymarket/py-clob-client)  
  * Python Relay client: [https://github.com/Polymarket/py-builder-relayer-client](https://github.com/Polymarket/py-builder-relayer-client)  
  * Rust Client (includes data endpoints and clob): [https://github.com/Polymarket/rs-clob-client](https://github.com/Polymarket/rs-clob-client)

* Example Repos / Demos:   
  * WAGMI integration: [https://github.com/Polymarket/wagmi-safe-builder-example](https://github.com/Polymarket/wagmi-safe-builder-example)  
  * Privy integration:   
    [https://github.com/Polymarket/privy-safe-builder-example](https://github.com/Polymarket/privy-safe-builder-example)  
  * Magic link integration: [https://github.com/Polymarket/magic-safe-builder-example](https://github.com/Polymarket/magic-safe-builder-example)  
  * Turnkey integration: [https://github.com/Polymarket/turnkey-safe-builder-example](https://github.com/Polymarket/turnkey-safe-builder-example)

\> All integration examples include data fetching, placing order and other misc activities using Polymarket APIs

---

### **6\. Example Project Ideas (Recommended)**

Here are some example ideas to help kickstart the building process.

1. **Leveraged Perps Position \+ Prediction Market Hedge Visualizer**  
   A visual tool that allows a user to model a leveraged crypto position (e.g., a perpetual futures trade on Hyperliquid) alongside one or more Polymarket contracts used as a hedge. The tool would show price and time windows where the combined strategy is profitable, breakeven, or loss-making, helping users understand how prediction markets can cap downside, add convexity, or shift risk across different resolution horizons.

2. **Cross-Market Strategy & Inefficiency Analyzer**  
   A dashboard that analyzes related or non-mutually exclusive markets (e.g., short-term vs long-term price thresholds) to visualize combined payoffs, detect relative mispricing, and highlight potentially inefficient market relationships.   
3. **Correlation-Aware Trade Recommendation Engine**  
   A tool that evaluates correlated events (e.g., ETH vs BTC price moves, macro events across assets) and suggests more capital-efficient markets or alternative contracts based on implied probabilities and historical relationships.  
   1. Note: This does not need to be limited to finance prediction markets. For example, there are many political prediction markets that have correlations with finance and culture markets\!

*There are many unlockable ideas in this space; don’t feel limited to the examples above. We encourage creative approaches that help users better understand risk, probability, and payoff before placing a trade.*

