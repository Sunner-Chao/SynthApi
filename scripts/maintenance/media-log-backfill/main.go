// Backfill media classification in small transactions. Build on the build host;
// run with SQL_DSN/LOG_SQL_DSN from the service environment, never as arguments.
package main

import (
	"fmt"
	"os"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "media backfill failed (database details omitted)")
		os.Exit(1)
	}
}
func run() error {
	dsn := os.Getenv("LOG_SQL_DSN")
	if dsn == "" {
		dsn = os.Getenv("SQL_DSN")
	}
	var driver gorm.Dialector
	switch os.Getenv("MEDIA_DB_DRIVER") {
	case "sqlite":
		driver = sqlite.Open(dsn)
	case "mysql":
		driver = mysql.Open(dsn)
	default:
		driver = postgres.Open(dsn)
	}
	db, err := gorm.Open(driver, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	sqlDB.SetMaxOpenConns(1)
	if !db.Migrator().HasColumn(&model.Log{}, "media_kind") {
		if db.Dialector.Name() == "postgres" {
			db.Exec("SET lock_timeout='3s'")
		}
		if err := db.Migrator().AddColumn(&model.Log{}, "MediaKind"); err != nil {
			return err
		}
	}
	// Build indexes online on PostgreSQL; other drivers use their migrator.
	if db.Dialector.Name() == "postgres" {
		for _, statement := range []string{
			"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_media_created ON logs(media_kind,created_at)",
			"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_user_media_created ON logs(user_id,media_kind,created_at)",
		} {
			if err := db.Exec(statement).Error; err != nil {
				return err
			}
		}
	} else {
		for _, name := range []string{"idx_logs_media_created", "idx_logs_user_media_created"} {
			if !db.Migrator().HasIndex(&model.Log{}, name) {
				if err := db.Migrator().CreateIndex(&model.Log{}, name); err != nil {
					return err
				}
			}
		}
	}
	last, total := 0, 0
	for {
		var rows []struct {
			Id        int
			Type      int
			ModelName string
			Other     string
		}
		if err := db.Table("logs").Select("id,type,model_name,other").Where("id > ? AND (media_kind = '' OR media_kind IS NULL)", last).Order("id").Limit(300).Find(&rows).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			break
		}
		groups := map[string][]int{}
		for _, row := range rows {
			var other struct {
				RequestPath string `json:"request_path"`
			}
			_ = common.UnmarshalJsonStr(row.Other, &other)
			kind := "other"
			if row.Type == model.LogTypeConsume || row.Type == model.LogTypeError || row.Type == model.LogTypeRefund {
				kind = model.ClassifyMediaLog(row.ModelName, other.RequestPath)
			}
			groups[kind] = append(groups[kind], row.Id)
			last = row.Id
		}
		for kind, ids := range groups {
			if err := db.Table("logs").Where("id IN ? AND (media_kind = '' OR media_kind IS NULL)", ids).Update("media_kind", kind).Error; err != nil {
				return err
			}
		}
		total += len(rows)
		if total%15000 == 0 {
			fmt.Printf("Classified %d records\n", total)
		}
		time.Sleep(30 * time.Millisecond)
	}
	fmt.Printf("Media classification complete: %d records\n", total)
	return nil
}
