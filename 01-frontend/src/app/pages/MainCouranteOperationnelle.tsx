import MainCourante from "../components/MainCourante";

export default function MainCouranteOperationnelle() {
  return (
    <MainCourante
      cell="OPERATIONAL"
      permissionResource="MAIN_COURANTE_OPS"
      title="Main courante — Cellule opérationnelle"
      subtitle="Journal des actions techniques et opérationnelles"
    />
  );
}
