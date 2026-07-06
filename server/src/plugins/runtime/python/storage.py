import asyncio
import inspect
from collections.abc import Awaitable, Callable
from contextlib import suppress
from copy import deepcopy
from typing import Any, Literal, cast

from deepdiff.diff import DeepDiff
from plugins.runtime.python.config_db import PluginConfigDb

from _camera_ui_tools.camera_ui_common import ObjectPath, merge, merge_with
from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient, RPCMethod
from _camera_ui_tools.camera_ui_sdk import (
    API_EVENT,
    FormSubmitResponse,
    JsonSchema,
    PluginAPI,
    SchemaConfig,
)
from _camera_ui_tools.camera_ui_sdk import DeviceStorage as DeviceStorageInterface
from plugins.runtime.python.namespaces import (
    NamespaceManager,
)
from plugins.runtime.python.schema import (
    generate_config_from_schemas,
    get_value_by_key,
    is_button_type,
    is_submit_type,
    remove_callbacks_from_schemas,
)
from plugins.runtime.python.typings import PluginInfo

ConfigDict = dict[str, Any]

OnSetCallback = Callable[[Any, Any], Awaitable[None] | None]
OnGetCallback = Callable[[], Awaitable[Any] | Any]
OnClickCallback = Callable[[Any], Awaitable[FormSubmitResponse | None] | FormSubmitResponse | None]


def merge2(
    source: Any,
    target: Any,
    key: str | int | None,
    source_object: Any,
    target_object: Any,
    stack: list[dict[Any, Any]],
) -> Any:
    if isinstance(source, list):
        return target
    if target is None:
        return source
    return None


class DeviceStorage(DeviceStorageInterface):
    def __init__(
        self,
        api: PluginAPI,
        proxy: RPCClient,
        plugin: PluginInfo,
        plugin_db: PluginConfigDb,
        device_id: str,
        schemas: list[JsonSchema] | None = [],
        is_plugin_storage: bool = False,
        sensor_id: str | None = None,
        camera_id: str | None = None,
    ) -> None:
        if schemas is None:
            schemas = []

        self.schemas: list[JsonSchema] = schemas
        self.values: dict[str, Any] = {}

        self.__api = api
        self.__proxy = proxy
        self.__plugin = plugin
        self.__plugin_db = plugin_db
        self.__device_id = device_id
        self.__is_plugin_storage = is_plugin_storage
        self.__sensor_id = sensor_id
        self.__camera_id = camera_id
        self.__close_proxy: CloseHandler | None = None

        if self.__sensor_id is not None and self.__camera_id is not None:
            sensor_ns = NamespaceManager.plugin_sensor_namespaces(
                plugin["id"], self.__camera_id, self.__sensor_id
            )
            self.__storage_namespace = sensor_ns.sensor_storage_rpc
        elif self.__is_plugin_storage:
            plugin_ns = NamespaceManager.plugin_namespaces(plugin["id"])
            self.__storage_namespace = plugin_ns.plugin_storage_rpc
        else:
            camera_ns = NamespaceManager.plugin_camera_namespaces(plugin["id"], self.__device_id)
            self.__storage_namespace = camera_ns.camera_storage_rpc

        self.__api.once(API_EVENT.SHUTDOWN, self.__close)

    @RPCMethod
    async def getValue(self, key: str, default_value: Any | None = None) -> Any:
        schema: Any = next((schema for schema in self.schemas if schema["key"] == key), None)
        config_value = ObjectPath.get(self.values, key)
        schema_default_value = (
            schema["defaultValue"] if "defaultValue" in schema and schema["defaultValue"] else None
        )

        if schema:
            on_get_function = schema.get("onGet", None)
            if on_get_function is not None:
                if inspect.iscoroutinefunction(on_get_function):
                    return await on_get_function()
                else:
                    res = on_get_function()

                    if inspect.iscoroutine(res):
                        return await res
                    else:
                        return on_get_function()  # type: ignore

        if config_value is not None:
            return config_value

        if schema_default_value is not None:
            return schema_default_value

        if default_value is not None:
            return default_value

        return None

    @RPCMethod
    async def setValue(self, key: str, new_value: Any) -> None:
        schema: Any = next((schema for schema in self.schemas if schema["key"] == key), None)

        if schema:
            old_value = ObjectPath.get(self.values, key)
            ObjectPath.set(self.values, key, new_value)

            on_set_function = schema.get("onSet", None)
            if on_set_function:
                if inspect.iscoroutinefunction(on_set_function):
                    await on_set_function(new_value, old_value)
                else:
                    res = on_set_function(new_value, old_value)

                    if inspect.iscoroutine(res):
                        await res
                    else:
                        on_set_function(new_value, old_value)

            if self.__contains_storable_schema(schema):
                self.save()

    @RPCMethod
    async def submitValue(self, key: str, new_value: Any) -> FormSubmitResponse | None:
        schema: Any = next((schema for schema in self.schemas if schema["key"] == key), None)

        if schema and schema["type"] == "submit":
            on_click_function = schema.get("onClick", None)
            if on_click_function:
                if inspect.iscoroutinefunction(on_click_function):
                    return await on_click_function(new_value)
                else:
                    res = on_click_function(new_value)

                    if inspect.iscoroutine(res):
                        return await res
                    else:
                        return on_click_function(new_value)

        return None

    @RPCMethod
    def setInternalValue(self, key: str, value: Any) -> None:
        ObjectPath.set(self.values, key, value)
        self.save()

    @RPCMethod
    def hasValue(self, key: str) -> bool:
        config_value = ObjectPath.get(self.values, key)
        return config_value is not None

    @RPCMethod
    async def getConfig(self) -> SchemaConfig:
        await self.__resolve_on_get_functions(self.schemas)
        filtered_schema: Any = remove_callbacks_from_schemas(self.schemas)
        schema_config: SchemaConfig = {"schema": filtered_schema, "config": self.values}
        return schema_config

    @RPCMethod
    async def setConfig(self, new_config: dict[str, Any]) -> None:
        old_config = deepcopy(self.values)
        self.values = merge_with(self.values, new_config, merge)

        await self.__trigger_on_set_for_changes(old_config, self.values)
        self.save()

    @RPCMethod
    async def addSchema(self, schema: JsonSchema) -> None:
        should_save = False

        schema_exist = next((schema for schema in self.schemas if schema["key"] == schema["key"]), None)

        if schema_exist:
            raise Exception(f"Schema with key {schema['key']} already exists")
        else:
            self.schemas.append(schema)

        await self.__resolve_on_get_functions(schema)

        if self.__contains_storable_schema(schema):
            should_save = True

        if should_save:
            self.save()

    @RPCMethod
    def removeSchema(self, key: str) -> None:
        schema = next((schema for schema in self.schemas if schema["key"] == key), None)
        self.schemas = [s for s in self.schemas if s["key"] != key]
        ObjectPath.delete(self.values, key)

        if schema and self.__contains_storable_schema(schema):
            self.save()

    @RPCMethod
    async def changeSchema(self, key: str, new_schema: dict[str, Any]) -> None:
        new_schema["key"] = key
        schema = next((schema for schema in self.schemas if schema["key"] == new_schema["key"]), None)

        if schema:
            merge_with(schema, new_schema, merge)

            await self.__resolve_on_get_functions(schema)

            if self.__contains_storable_schema(schema):
                self.save()

    @RPCMethod
    def getSchema(self, key: str) -> JsonSchema | None:
        return next((schema for schema in self.schemas if schema["key"] == key), None)

    @RPCMethod
    def hasSchema(self, key: str) -> bool:
        return any(schema["key"] == key for schema in self.schemas)

    @RPCMethod
    async def destroy(self) -> None:
        self.__api.removeListener(API_EVENT.SHUTDOWN, self.__close)
        config: Any = cast(dict[str, Any], self.__plugin_db.get("config") or {})
        if self.__device_id in config:
            del config[self.__device_id]
            self.values = {}
            self.__plugin_db.update({"config": config})

    def save(self) -> None:
        config: Any = cast(dict[str, Any], self.__plugin_db.get("config") or {})

        if len(self.schemas) > 0:
            storable_config = self.__filter_storable_values(self.schemas)
        else:
            storable_config = self.values

        config[self.__device_id] = storable_config
        self.__plugin_db.update({"config": config})

    def defineSchemas(self, schemas: list[JsonSchema]) -> None:
        self.schemas = schemas
        self.__initializeStorage()

    # Internal method
    def update_schema(self, schemas: list[JsonSchema] = []) -> None:
        self.schemas = schemas
        self.__initializeStorage()

    # Internal method
    async def register_storage(self) -> None:
        self.__close_proxy = await self.__proxy.register_handler(self.__storage_namespace, self)

    # Internal method
    async def unregister_storage(self) -> None:
        if self.__close_proxy:
            await self.__close_proxy()

    async def __resolve_on_get_functions(
        self,
        schemas: JsonSchema | list[JsonSchema],
    ) -> None:
        if not isinstance(schemas, list):
            schemas = [schemas]

        for schema in schemas:
            if not is_button_type(schema) and not is_submit_type(schema) and "onGet" in schema:
                schema_value = await self.getValue(schema["key"])
                if schema_value is not None:
                    ObjectPath.set(self.values, schema["key"], schema_value)

    async def __trigger_on_set_for_changes(
        self, old_config: dict[str, Any], new_config: dict[str, Any]
    ) -> None:
        tasks: list[Awaitable[None | Any]] = []

        for config_key in list(new_config.keys()):
            old_value: Any = get_value_by_key(old_config, config_key) or {}
            new_value: Any = new_config[config_key]

            if DeepDiff(old_value, new_value, ignore_order=True) != {}:
                schema = next((schema for schema in self.schemas if schema["key"] == config_key), None)
                if schema and schema["type"] != "submit" and "onSet" in schema:
                    on_set_function: Any = schema.get("onSet", None)
                    if on_set_function:

                        async def process_on_set(
                            func: Callable[[Any, Any], Awaitable[None | Any]]
                            | Callable[[Any, Any], None | Any],
                            new_val: Any,
                            old_val: Any,
                        ) -> None:
                            if inspect.iscoroutinefunction(func):
                                await func(new_val, old_val)
                            else:
                                res = func(new_val, old_val)
                                if inspect.iscoroutine(res):
                                    await res

                        tasks.append(process_on_set(on_set_function, new_value, old_value))

        if tasks:
            await asyncio.gather(*tasks)

    def __filter_storable_values(
        self,
        schemas: list[JsonSchema],
        result: ConfigDict | None = None,
    ) -> ConfigDict:
        if result is None:
            result = {}

        for schema in schemas:
            if is_button_type(schema) or is_submit_type(schema):
                continue

            if "store" in schema and schema["store"]:
                config_value = get_value_by_key(self.values, schema["key"])
                ObjectPath.set(result, schema["key"], config_value)

        # Preserve internal values (prefixed with '_') that have no schema
        for key, value in self.values.items():
            if key.startswith("_"):
                result[key] = value

        return result

    def __contains_storable_schema(
        self,
        schema: JsonSchema,
    ) -> bool:
        if is_button_type(schema) or is_submit_type(schema):
            return False

        return bool("store" in schema and schema["store"])

    def __initializeStorage(self) -> None:
        config: Any = cast(dict[str, Any], self.__plugin_db.get("config") or {})
        device_config = config.get(self.__device_id, {})
        schema_config = generate_config_from_schemas(self.schemas)
        self.values = merge_with(schema_config, device_config, merge2)

    async def __close(self) -> None:
        with suppress(Exception):
            self.save()
            await self.unregister_storage()
