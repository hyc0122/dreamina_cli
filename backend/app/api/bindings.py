"""分镜资产绑定接口边界。

负责分镜与角色、场景、道具的手动绑定、解绑和排序。
不要在这里创建资产文件，也不要触发视频生成。
"""

from fastapi import APIRouter, Query

from .context import _call, _dump, _model_data, _now, get_store
from .schemas import BindingCreate, BindingReorder, BindingUpdate


router = APIRouter(prefix="/jimeng", tags=["jimeng-bindings"])


def _parse_ids(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@router.get("/projects/{project_id}/bindings")
def list_project_bindings(project_id: str, shot_ids: str | None = Query(default=None)):
    def list_bulk():
        bindings_by_shot_id = get_store().list_bindings_for_shots(project_id, _parse_ids(shot_ids))
        return {"bindings_by_shot_id": {shot_id: _dump(bindings) for shot_id, bindings in bindings_by_shot_id.items()}}

    return _call(list_bulk)


@router.get("/projects/{project_id}/shots/{shot_id}/bindings")
def list_bindings(project_id: str, shot_id: str):
    return _call(lambda: _dump(get_store().list_bindings(project_id, shot_id)))


@router.post("/projects/{project_id}/shots/{shot_id}/bindings")
def create_binding(project_id: str, shot_id: str, request: BindingCreate):
    return _call(
        lambda: _dump(
            get_store().create_binding(
                project_id,
                shot_id,
                request.asset_id,
                request.asset_type,
                request.source,
                request.locked,
                request.slot_order,
            )
        )
    )


@router.delete("/projects/{project_id}/shots/{shot_id}/bindings/{binding_id}")
def delete_binding(project_id: str, shot_id: str, binding_id: str):
    return _call(lambda: (get_store().list_bindings(project_id, shot_id), get_store().delete_binding(binding_id), {"deleted": binding_id})[2])


@router.put("/projects/{project_id}/shots/{shot_id}/bindings/{binding_id}")
def update_binding(project_id: str, shot_id: str, binding_id: str, request: BindingUpdate):
    def update():
        current = {binding.id for binding in get_store().list_bindings(project_id, shot_id)}
        if binding_id not in current:
            raise ValueError("binding does not belong to shot")
        return _dump(get_store().update_binding(binding_id, **_model_data(request, exclude_unset=True)))

    return _call(update)


@router.post("/projects/{project_id}/shots/{shot_id}/bindings/reorder")
def reorder_bindings(project_id: str, shot_id: str, request: BindingReorder):
    def reorder():
        current = {binding.id for binding in get_store().list_bindings(project_id, shot_id)}
        if any(binding_id not in current for binding_id in request.binding_ids):
            raise ValueError("binding does not belong to shot")
        _reorder_rows("asset_bindings", "id", "slot_order", request.binding_ids)
        return {"bindings": _dump(get_store().list_bindings(project_id, shot_id))}

    return _call(reorder)


def _reorder_rows(table: str, id_column: str, position_column: str, ids: list[str]) -> None:
    with get_store()._connect() as conn:
        for position, row_id in enumerate(ids, start=1):
            conn.execute(
                f"UPDATE {table} SET {position_column} = ?, updated_at = ? WHERE {id_column} = ?",
                (position, _now(), row_id),
            )
