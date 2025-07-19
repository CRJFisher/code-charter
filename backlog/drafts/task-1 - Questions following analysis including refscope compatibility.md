# Questions following analysis in task-1

## Data Model Differences, Call Graph Analysis, and RefScope Division of Responsibility with RefScope

For the sections `#### 3. Data Model Differences` and `### Golang Call Graph Logic to Port` and the following points in `### RefScope Integration Status`:

> - ❌ Missing `CallGraphItem` type definition
> - ❌ Data structure incompatible with existing consumers

- Do you think that `refscope` should perform the call graph analysis? Or does it make more sense to do that in the extension code? Maybe its a matter of taste? I'm leaning towards adding it as a feature in `refscope` since it could be useful for other projects.
- When it comes to the data format, we are not tied to the old SCIP format and the types in `CallGraphItem` are from that era and might be worth aligning with refscope.

Essentially, I'm asking how we should divide up where the type improvements (e.g. adding `children` to DefinitionNode) and the call graph analysis should be done.

## `get_all_definitions_in_file()` not implemented

> - ❌ `get_all_definitions_in_file()` not implemented

- What functionality will this be used for? Call graph construction?
