# Model evaluation adoption boundary

Discovery can establish that an entity exists and that an authoritative source changed. It cannot establish how a model behaves.

For every relevant model without accepted behavioral observations, the adoption register records:

- behavioral evidence: not yet established;
- five probe states: no current evidence;
- evaluation queue: `TEST_REQUIRED`;
- execution state: `NOT_RUN`;
- execution authorization: false.

The scheduled discovery workflow contains no provider inference step, no provider credential, no model-specific execution allowlist, and no spend/retry/cooldown policy. A future behavioral test requires a separate reviewed change and remains surface-specific. A model identity never establishes that a consumer product uses that model.

Historical operational attempts remain in the append-only evaluation ledger for auditability. An operational error has zero behavioral evidentiary weight and is excluded from public empirical results.
