namespace shadowtrader.ledger;
using { cuid, managed } from '@sap/cds/common';

// Append-only ledger: rows are only ever inserted. Nothing in the service
// exposes UPDATE or DELETE, so `createdAt`/`createdBy` from `managed` are the
// audit trail of who recorded what, and when.

// @assert.range makes CAP reject values outside the enum; without it, an
// enum is documentation only.
@assert.range type Direction : String(5) enum { long; short };
@assert.range type Decision  : String(8) enum { approved; rejected };

entity TradeTheses : cuid, managed {
  @mandatory ticker     : String(12);
  @mandatory direction  : Direction;
  @mandatory thesis     : LargeString;
  @assert.range: [0, 1]
  confidence : Decimal(3,2);
  model      : String(60);   // which LLM produced it
  risks      : Association to many RiskAssessments on risks.thesis = $self;
  approval   : Association to one Approvals on approval.thesis = $self;
}

entity RiskAssessments : cuid, managed {
  @mandatory @assert.target
  thesis     : Association to TradeTheses;
  @assert.range: [0, 100]
  riskScore  : Integer;
  @assert.range: [0, _]
  maxLossUSD : Decimal(12,2);
  @assert.range: [0, _]
  stopLoss   : Decimal(12,4);
  notes      : String(1000);
}

// One decision per thesis, enforced by the database. A rejected thesis stays
// rejected; re-proposing means recording a new thesis.
@assert.unique: { onePerThesis: [thesis] }
entity Approvals : cuid, managed {
  @mandatory @assert.target
  thesis   : Association to TradeTheses;
  @mandatory decision : Decision;
  @mandatory reason   : String(500);
}
