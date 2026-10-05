using { shadowtrader.ledger as db } from '../db/schema';

service LedgerService @(path: '/ledger', requires: 'authenticated-user') {

  @restrict: [{ grant: ['READ','CREATE'], to: 'LedgerWriter' },
              { grant: 'READ', to: ['Approver','Auditor'] }]
  entity TradeTheses as projection on db.TradeTheses;

  @restrict: [{ grant: ['READ','CREATE'], to: 'LedgerWriter' },
              { grant: 'READ', to: ['Approver','Auditor'] }]
  entity RiskAssessments as projection on db.RiskAssessments;

  // Approvals can only be written through `decide`, never by a direct CREATE.
  @readonly
  @restrict: [{ grant: 'READ', to: ['LedgerWriter','Approver','Auditor'] }]
  entity Approvals as projection on db.Approvals;

  @requires: 'Approver'
  action decide(thesis: UUID not null, decision: db.Decision not null, reason: String(500) not null) returns Approvals;

  // The gate the executor calls before placing any order.
  @requires: ['LedgerWriter','Approver','Auditor']
  function isApproved(thesis: UUID not null) returns Boolean;
}
