const cds = require('@sap/cds')

module.exports = class LedgerService extends cds.ApplicationService {
  init() {
    const { TradeTheses, RiskAssessments, Approvals } = this.entities

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
      await INSERT.into(Approvals).entries({ ID, thesis_ID: thesisId, decision, reason })
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
