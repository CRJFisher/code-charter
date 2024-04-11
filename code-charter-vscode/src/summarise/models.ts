import 'reflect-metadata';
import { Type, Expose } from 'class-transformer';

class DocRange {
    start_line!: number;
    start_character!: number;
    end_line!: number;
    end_character!: number;
}

class DefinitionNode {
    @Type(() => DocRange)
    range!: DocRange;

    document!: string;

    @Type(() => DocRange)
    enclosing_range!: DocRange;
}

class ReferenceNode {
    @Type(() => DocRange)
    range!: DocRange;

    document!: string;
}

class CallGraphNode {
    symbol!: string;

    @Type(() => DefinitionNode)
    definition_node!: DefinitionNode;

    @Type(() => CallGraphNode)
    children!: CallGraphNode[];

    @Type(() => ReferenceNode)
    reference_node!: ReferenceNode | null;

    @Expose({ name: 'repoLocalName' })
    get repoLocalName(): string {
        let shortened = this.symbol.split(" ").slice(4).join(" ")
            .replace(/`|\//g, ".")
            .replace(/\(|\)/g, "")
            .replace(/\.\./g, ".");
        shortened = shortened.replace(/^\./, "").replace(/\.$/, "");
        return shortened;
    }

    @Expose({ name: 'displayName' })
    get displayName(): string {
        return this.repoLocalName.split(".").pop() || '';
    }
}

export { CallGraphNode };