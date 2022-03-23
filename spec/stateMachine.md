# State Machine Model

# Bond

## Not created

- Allowed addresses can create a bond and move to "Unpaid and not matured"

## Unpaid and not matured

- When maturity date passes move to "unpaid and matured"
- Owner can fully repay and move to "Fully paid and not matured"

## Fully paid and not matured

- When maturity date passes move to "Fully paid and matured"

## Unpaid and matured (Defaulted)

- This state is terminal (no more transitions are possible)

## Fully paid and matured

- This state is terminal (no more transitions are possible)
