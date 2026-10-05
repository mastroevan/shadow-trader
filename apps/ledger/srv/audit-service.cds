using { shadowtrader.ledger as my } from '../db/schema';

/**
 * Read-only access to the Shadow Trader approval ledger: trade theses proposed
 * by the AI agent, their risk assessments, and the human approval decisions.
 */
@mcp
@requires: 'Auditor'
@mcp.instructions: 'This is an append-only audit ledger; rows are never updated or deleted. Use describe to see the entities, then query to answer questions. TradeTheses is the root: each thesis has risks (RiskAssessments.thesis_ID = TradeTheses.ID) and at most one review, a row in Approvals that is either approved or rejected (Approvals.thesis_ID = TradeTheses.ID). A thesis is approved only if it has an Approvals row with decision = ''approved''; a thesis with no Approvals row is still pending. createdBy on TradeTheses is who recorded it (the AI agent); createdBy on Approvals is the human who decided. Tickers use the app format, e.g. BTC/USD, ETH/USD, NVDA.'
service AuditService {

  /** Trade ideas recorded by the AI agent before any trade is opened. */
  @readonly entity TradeTheses as projection on my.TradeTheses { *, approval as review } excluding { modifiedAt, modifiedBy, approval };

  /** Risk numbers recorded for a thesis when it passed the automated risk gate. */
  @readonly entity RiskAssessments as projection on my.RiskAssessments excluding { modifiedAt, modifiedBy };

  /**
   * Human decisions on theses: one row per decided thesis, either approved or rejected.
   * The row count is approved + rejected. To count approved theses, filter decision = 'approved'.
   */
  @readonly entity Approvals as projection on my.Approvals excluding { modifiedAt, modifiedBy };
}

annotate AuditService.TradeTheses with {
  ID         @description: 'Thesis ID. RiskAssessments.thesis_ID and Approvals.thesis_ID point here.';
  ticker     @description: 'Instrument symbol in app format, e.g. BTC/USD, ETH/USD, NVDA.';
  direction  @description: 'Trade direction: long or short.';
  thesis     @description: 'The reasoning for the trade, written by the AI agent.';
  confidence @description: 'Model confidence from 0 to 1; may be empty.';
  model      @description: 'Which LLM produced the thesis; may be empty.';
  createdBy  @description: 'User who recorded the thesis, normally the AI agent. Taken from the login, never from the request.';
  createdAt  @description: 'When the thesis was recorded (UTC).';
  risks      @description: 'Risk assessments for this thesis.';
  review     @description: 'The human review of this thesis: one Approvals row, approved or rejected. Null means still pending. review.decision says which.';
};

annotate AuditService.RiskAssessments with {
  thesis     @description: 'The thesis this risk assessment belongs to (thesis_ID).';
  riskScore  @description: 'Optional risk score from 0 to 100. Usually empty for theses recorded by the app; do not read empty as zero risk.';
  maxLossUSD @description: 'Maximum loss allowed for this trade, in USD.';
  stopLoss   @description: 'Stop-loss price level.';
  notes      @description: 'Free-text risk notes, e.g. risk/reward ratio, position size, or why the risk gate flagged it.';
  createdBy  @description: 'User who recorded the risk assessment, normally the AI agent.';
  createdAt  @description: 'When the risk assessment was recorded (UTC).';
};

annotate AuditService.Approvals with {
  thesis     @description: 'The thesis this decision is for (thesis_ID).';
  decision   @description: 'approved or rejected. Only approved theses may open a trade.';
  reason     @description: 'Why the approver made this decision.';
  createdBy  @description: 'The human approver who made the decision. Only users with the Approver role can decide, and never on a thesis they recorded.';
  createdAt  @description: 'When the decision was made (UTC).';
};
