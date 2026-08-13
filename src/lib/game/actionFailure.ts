/**
 * Warum eine Handlung nicht geht.
 *
 * Ein Code, kein fertiger Satz: Die Formulierung gehört in die Oberfläche
 * (`actionMessage.ts`), sonst wäre jeder Grund an so vielen Stellen ausgeschrieben, wie
 * er vorkommt — und beim ersten Umformulieren gingen die Fassungen auseinander.
 *
 * Stand ursprünglich bei den Gebäudehandlungen. Seit es soziale Handlungen gibt, teilen
 * sich mehrere Regelwerke dieselben Gründe — „nicht genug Kraft" und „zu weit weg"
 * gelten für eine Schicht in der Schmiede wie für einen Besuch beim Nachbarn.
 */
export type ActionFailureReason =
	| 'NOT_ENOUGH_ACTION_POINTS'
	| 'NOT_ENOUGH_MONEY'
	| 'WRONG_REGION'
	| 'NOT_A_WORKPLACE'
	| 'PLOT_NOT_OWNED'
	| 'PLOT_ALREADY_BUILT'
	| 'LIMIT_REACHED'
	| 'SAME_PERSON'
	| 'NO_SUCH_PERSON'
	| 'TOO_YOUNG'
	| 'ALREADY_MARRIED'
	| 'TOO_LITTLE_AFFECTION'
	| 'CLOSE_KIN'
	| 'SAME_GENDER'
	| 'NO_PROPOSAL'
	| 'NO_ROOM'
	| 'NOTHING_TO_DO'
	| 'MAX_LEVEL'
	| 'NOT_FOR_SALE'
	| 'ALREADY_OWNED'
	| 'NOTHING_TO_LEARN'
	| 'TEACHER_TOO_TIRED'
	| 'NOT_EDIBLE'
	| 'NOT_IN_STOCK'
	| 'WRONG_SEASON'
	| 'NOT_LEASED';
