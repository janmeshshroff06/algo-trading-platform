from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Algo Trading Platform"
    API_V1_STR: str = "/api"
    # DB_URL: str = "postgresql://user:password@localhost:5432/algodb"

    class Config:
        env_file = ".env"


settings = Settings()
