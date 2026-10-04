const cds = require('@sap/cds')

module.exports = class LedgerService extends cds.ApplicationService {
  init() {
    const { TradeTheses, RiskAssessments, Approvals } = this.entities

    // Second layer: @restrict already grants nobody UPDATE or DELETE. This
    // rejects them anyway, so the ledger stays append-only even if a grant is
    // added by mistake or a privileged caller goes through the service API.
    this.before(['UPDATE', 'DELETE'], '*', req => {
      req.reject(405, `The ledger is append-only: ${req.event} is not allowed on ${req.target.name}`)
    })

    this.on('decide', async req => {
      const { thesis: thesisId, decision, reason } = req.data

      const thesis = await SELECT.one.from(TradeTheses, thesisId).columns('ID', 'createdBy')
      if (!thesis) return req.reject(404, `Thesis ${thesisId} not found`)

      // Four-eyes rule: whoever recorded the thesis cannot approve it.
      if (thesis.createdBy === req.user.id) {
        return req.reject(403, 'Approver must be a different user than the thesis author')
      }

      if (await SELECT.one.from(Approvals).where({ thesis_ID: thesisId })) {
        return req.reject(409, `Thesis ${thesisId} already has a decision`)
      }

      if (decision === 'approved') {
        const risk = await SELECT.one.from(RiskAssessments).where({ thesis_ID: thesisId })
        if (!risk) return req.reject(422, 'Cannot approve a thesis without a risk assessment')
      }

      const ID = cds.utils.uuid()
      try {
        await INSERT.into(Approvals).entries({ ID, thesis_ID: thesisId, decision, reason })
      } catch (error) {
        // Two decide calls racing past the check above: the unique constraint
        // on Approvals.thesis stops the second one.
        if (isUniqueViolation(error)) return req.reject(409, `Thesis ${thesisId} already has a decision`)
        throw error
      }
      return SELECT.one.from(Approvals, ID)
    })

    this.on('isApproved', async req => {
      const row = await SELECT.one.from(Approvals)
        .where({ thesis_ID: req.data.thesis, decision: 'approved' })
      return !!row
    })

    return super.init()
  }
}

function isUniqueViolation(error) {
  return error.code === 'UNIQUE_CONSTRAINT_VIOLATION' || /unique/i.test(error.message ?? '')
}
